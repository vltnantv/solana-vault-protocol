import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { VaultProject } from "../target/types/vault_project";
import { expect } from "chai";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";

describe("vault_project", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const connection = provider.connection;
  const program = anchor.workspace.vaultProject as Program<VaultProject>;
  const admin = provider.wallet;

  let vaultPda: PublicKey;
  let vaultBump: number;
  let treasuryPda: PublicKey;
  let treasuryBump: number;

  /** Airdrop helper using blockhash-based confirmation (no WebSocket dependency). */
  async function airdropSol(to: PublicKey, lamports: number) {
    const bh = await connection.getLatestBlockhash();
    const sig = await connection.requestAirdrop(to, lamports);
    await connection.confirmTransaction(
      { signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight },
      "confirmed"
    );
  }

  before(() => {
    [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), admin.publicKey.toBuffer()],
      program.programId
    );
    [treasuryPda, treasuryBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury"), vaultPda.toBuffer()],
      program.programId
    );
  });

  // ─── Initialize ──────────────────────────────────────────────

  describe("initialize", () => {
    it("creates a vault with correct state", async () => {
      await program.methods
        .initialize()
        .accountsPartial({
          admin: admin.publicKey,
          vault: vaultPda,
          treasury: treasuryPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const vault = await program.account.vault.fetch(vaultPda);
      expect(vault.admin.toString()).to.equal(admin.publicKey.toString());
      expect(vault.totalDeposited.toNumber()).to.equal(0);
      expect(vault.totalWithdrawn.toNumber()).to.equal(0);
      expect(vault.vaultBump).to.equal(vaultBump);
      expect(vault.treasuryBump).to.equal(treasuryBump);
      expect(vault.createdAt.toNumber()).to.be.greaterThan(0);
    });

    it("rejects duplicate initialization", async () => {
      try {
        await program.methods
          .initialize()
          .accountsPartial({
            admin: admin.publicKey,
            vault: vaultPda,
            treasury: treasuryPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.exist;
      }
    });
  });

  // ─── Deposit ─────────────────────────────────────────────────

  describe("deposit", () => {
    const oneSOL = LAMPORTS_PER_SOL;

    it("deposits SOL into the treasury", async () => {
      const before = await connection.getBalance(treasuryPda);

      await program.methods
        .deposit(new anchor.BN(oneSOL))
        .accountsPartial({
          depositor: admin.publicKey,
          vault: vaultPda,
          treasury: treasuryPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const after = await connection.getBalance(treasuryPda);
      expect(after - before).to.equal(oneSOL);

      const vault = await program.account.vault.fetch(vaultPda);
      expect(vault.totalDeposited.toNumber()).to.equal(oneSOL);
    });

    it("accumulates across multiple deposits", async () => {
      const second = 0.5 * LAMPORTS_PER_SOL;

      await program.methods
        .deposit(new anchor.BN(second))
        .accountsPartial({
          depositor: admin.publicKey,
          vault: vaultPda,
          treasury: treasuryPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const vault = await program.account.vault.fetch(vaultPda);
      expect(vault.totalDeposited.toNumber()).to.equal(oneSOL + second);
    });

    it("allows a non-admin depositor", async () => {
      const depositor = Keypair.generate();
      const amount = 0.25 * LAMPORTS_PER_SOL;

      await airdropSol(depositor.publicKey, 2 * LAMPORTS_PER_SOL);

      const before = await connection.getBalance(treasuryPda);

      await program.methods
        .deposit(new anchor.BN(amount))
        .accountsPartial({
          depositor: depositor.publicKey,
          vault: vaultPda,
          treasury: treasuryPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([depositor])
        .rpc();

      const after = await connection.getBalance(treasuryPda);
      expect(after - before).to.equal(amount);
    });

    it("rejects zero-amount deposit", async () => {
      try {
        await program.methods
          .deposit(new anchor.BN(0))
          .accountsPartial({
            depositor: admin.publicKey,
            vault: vaultPda,
            treasury: treasuryPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(anchor.AnchorError);
        expect((err as anchor.AnchorError).error.errorCode.code).to.equal(
          "InvalidDepositAmount"
        );
      }
    });
  });

  // ─── Withdraw ────────────────────────────────────────────────

  describe("withdraw", () => {
    it("allows admin to withdraw SOL", async () => {
      const amount = 0.5 * LAMPORTS_PER_SOL;
      const adminBefore = await connection.getBalance(admin.publicKey);

      await program.methods
        .withdraw(new anchor.BN(amount))
        .accountsPartial({
          admin: admin.publicKey,
          vault: vaultPda,
          treasury: treasuryPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const adminAfter = await connection.getBalance(admin.publicKey);
      expect(adminAfter).to.be.greaterThan(adminBefore);

      const vault = await program.account.vault.fetch(vaultPda);
      expect(vault.totalWithdrawn.toNumber()).to.equal(amount);
    });

    it("rejects unauthorized withdraw", async () => {
      const attacker = Keypair.generate();
      await airdropSol(attacker.publicKey, LAMPORTS_PER_SOL);

      try {
        await program.methods
          .withdraw(new anchor.BN(100_000))
          .accountsPartial({
            admin: attacker.publicKey,
            vault: vaultPda,
            treasury: treasuryPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([attacker])
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        // Fails on PDA seed mismatch: seeds use attacker.key() which doesn't derive to vaultPda
        expect(err).to.exist;
      }
    });

    it("rejects zero-amount withdraw", async () => {
      try {
        await program.methods
          .withdraw(new anchor.BN(0))
          .accountsPartial({
            admin: admin.publicKey,
            vault: vaultPda,
            treasury: treasuryPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(anchor.AnchorError);
        expect((err as anchor.AnchorError).error.errorCode.code).to.equal(
          "InvalidWithdrawAmount"
        );
      }
    });

    it("rejects withdrawal exceeding balance", async () => {
      const balance = await connection.getBalance(treasuryPda);

      try {
        await program.methods
          .withdraw(new anchor.BN(balance + LAMPORTS_PER_SOL))
          .accountsPartial({
            admin: admin.publicKey,
            vault: vaultPda,
            treasury: treasuryPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(anchor.AnchorError);
        expect((err as anchor.AnchorError).error.errorCode.code).to.equal(
          "InsufficientBalance"
        );
      }
    });

    it("allows full withdrawal of remaining balance", async () => {
      const balance = await connection.getBalance(treasuryPda);
      expect(balance).to.be.greaterThan(0);

      await program.methods
        .withdraw(new anchor.BN(balance))
        .accountsPartial({
          admin: admin.publicKey,
          vault: vaultPda,
          treasury: treasuryPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const after = await connection.getBalance(treasuryPda);
      expect(after).to.equal(0);
    });
  });
});
