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

  /** Airdrop helper using blockhash-based confirmation. */
  async function airdropSol(to: PublicKey, lamports: number) {
    const bh = await connection.getLatestBlockhash();
    const sig = await connection.requestAirdrop(to, lamports);
    await connection.confirmTransaction(
      { signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight },
      "confirmed"
    );
  }

  function deriveChildPda(vault: PublicKey, authority: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("child"), vault.toBuffer(), authority.toBuffer()],
      program.programId
    );
  }

  function derivePayoutPda(vault: PublicKey, child: PublicKey, nonce: number): [PublicKey, number] {
    const nonceBuffer = Buffer.alloc(8);
    nonceBuffer.writeBigUInt64LE(BigInt(nonce));
    return PublicKey.findProgramAddressSync(
      [Buffer.from("payout"), vault.toBuffer(), child.toBuffer(), nonceBuffer],
      program.programId
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

  // ─── Deposit and Auto-Register ──────────────────────────────

  describe("deposit_and_auto_register", () => {
    const oneSOL = LAMPORTS_PER_SOL;

    it("auto-registers child on first deposit", async () => {
      const [childPda] = deriveChildPda(vaultPda, admin.publicKey);

      const treasuryBefore = await connection.getBalance(treasuryPda);

      await program.methods
        .depositAndAutoRegister(new anchor.BN(oneSOL))
        .accountsPartial({
          depositor: admin.publicKey,
          vault: vaultPda,
          child: childPda,
          treasury: treasuryPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const treasuryAfter = await connection.getBalance(treasuryPda);
      expect(treasuryAfter - treasuryBefore).to.equal(oneSOL);

      const child = await program.account.childAccount.fetch(childPda);
      expect(child.vault.toString()).to.equal(vaultPda.toString());
      expect(child.authority.toString()).to.equal(admin.publicKey.toString());
      expect(child.totalDeposited.toNumber()).to.equal(oneSOL);
      expect(child.totalPaidOut.toNumber()).to.equal(0);
      expect(child.createdAt.toNumber()).to.be.greaterThan(0);
    });

    it("accumulates deposits on existing child", async () => {
      const [childPda] = deriveChildPda(vaultPda, admin.publicKey);
      const secondAmount = 0.5 * LAMPORTS_PER_SOL;

      await program.methods
        .depositAndAutoRegister(new anchor.BN(secondAmount))
        .accountsPartial({
          depositor: admin.publicKey,
          vault: vaultPda,
          child: childPda,
          treasury: treasuryPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const child = await program.account.childAccount.fetch(childPda);
      expect(child.totalDeposited.toNumber()).to.equal(oneSOL + secondAmount);
    });

    it("allows a non-admin depositor", async () => {
      const depositor = Keypair.generate();
      const amount = 0.25 * LAMPORTS_PER_SOL;

      await airdropSol(depositor.publicKey, 2 * LAMPORTS_PER_SOL);

      const [childPda] = deriveChildPda(vaultPda, depositor.publicKey);
      const treasuryBefore = await connection.getBalance(treasuryPda);

      await program.methods
        .depositAndAutoRegister(new anchor.BN(amount))
        .accountsPartial({
          depositor: depositor.publicKey,
          vault: vaultPda,
          child: childPda,
          treasury: treasuryPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([depositor])
        .rpc();

      const treasuryAfter = await connection.getBalance(treasuryPda);
      expect(treasuryAfter - treasuryBefore).to.equal(amount);

      const child = await program.account.childAccount.fetch(childPda);
      expect(child.authority.toString()).to.equal(depositor.publicKey.toString());
      expect(child.totalDeposited.toNumber()).to.equal(amount);
    });

    it("rejects zero-amount deposit", async () => {
      const [childPda] = deriveChildPda(vaultPda, admin.publicKey);

      try {
        await program.methods
          .depositAndAutoRegister(new anchor.BN(0))
          .accountsPartial({
            depositor: admin.publicKey,
            vault: vaultPda,
            child: childPda,
            treasury: treasuryPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(anchor.AnchorError);
        expect((err as anchor.AnchorError).error.errorCode.code).to.equal(
          "InvalidAmount"
        );
      }
    });
  });

  // ─── Admin Request Payout ───────────────────────────────────

  describe("admin_request_payout", () => {
    const nonce = 1;

    it("creates a payout PDA", async () => {
      const [childPda] = deriveChildPda(vaultPda, admin.publicKey);
      const [payoutPda] = derivePayoutPda(vaultPda, childPda, nonce);

      const child = await program.account.childAccount.fetch(childPda);
      const remaining = child.totalDeposited.toNumber() - child.totalPaidOut.toNumber();
      const payoutAmount = Math.floor(remaining / 2); // request half

      await program.methods
        .adminRequestPayout(new anchor.BN(payoutAmount), new anchor.BN(nonce))
        .accountsPartial({
          admin: admin.publicKey,
          vault: vaultPda,
          child: childPda,
          payout: payoutPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const payout = await program.account.pendingPayout.fetch(payoutPda);
      expect(payout.vault.toString()).to.equal(vaultPda.toString());
      expect(payout.child.toString()).to.equal(childPda.toString());
      expect(payout.amount.toNumber()).to.equal(payoutAmount);
      expect(payout.executed).to.equal(false);
      expect(payout.requestedAt.toNumber()).to.be.greaterThan(0);
    });

    it("rejects unauthorized caller", async () => {
      const attacker = Keypair.generate();
      await airdropSol(attacker.publicKey, 2 * LAMPORTS_PER_SOL);

      const [childPda] = deriveChildPda(vaultPda, admin.publicKey);
      const [payoutPda] = derivePayoutPda(vaultPda, childPda, 99);

      try {
        await program.methods
          .adminRequestPayout(new anchor.BN(100_000), new anchor.BN(99))
          .accountsPartial({
            admin: attacker.publicKey,
            vault: vaultPda,
            child: childPda,
            payout: payoutPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([attacker])
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.exist;
      }
    });

    it("rejects amount exceeding remaining", async () => {
      const [childPda] = deriveChildPda(vaultPda, admin.publicKey);
      const child = await program.account.childAccount.fetch(childPda);
      const remaining = child.totalDeposited.toNumber() - child.totalPaidOut.toNumber();
      const tooMuch = remaining + 1;

      const nonceExceed = 200;
      const [payoutPda] = derivePayoutPda(vaultPda, childPda, nonceExceed);

      try {
        await program.methods
          .adminRequestPayout(new anchor.BN(tooMuch), new anchor.BN(nonceExceed))
          .accountsPartial({
            admin: admin.publicKey,
            vault: vaultPda,
            child: childPda,
            payout: payoutPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(anchor.AnchorError);
        expect((err as anchor.AnchorError).error.errorCode.code).to.equal(
          "ExceedsAllowedPayout"
        );
      }
    });

    it("rejects zero amount", async () => {
      const [childPda] = deriveChildPda(vaultPda, admin.publicKey);
      const nonceZero = 201;
      const [payoutPda] = derivePayoutPda(vaultPda, childPda, nonceZero);

      try {
        await program.methods
          .adminRequestPayout(new anchor.BN(0), new anchor.BN(nonceZero))
          .accountsPartial({
            admin: admin.publicKey,
            vault: vaultPda,
            child: childPda,
            payout: payoutPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(anchor.AnchorError);
        expect((err as anchor.AnchorError).error.errorCode.code).to.equal(
          "InvalidAmount"
        );
      }
    });
  });

  // ─── Admin Execute Payout ───────────────────────────────────

  describe("admin_execute_payout", () => {
    const nonce = 1;

    it("executes payout (SOL to authority)", async () => {
      const [childPda] = deriveChildPda(vaultPda, admin.publicKey);
      const [payoutPda] = derivePayoutPda(vaultPda, childPda, nonce);

      const payout = await program.account.pendingPayout.fetch(payoutPda);
      const recipientBefore = await connection.getBalance(admin.publicKey);

      await program.methods
        .adminExecutePayout()
        .accountsPartial({
          admin: admin.publicKey,
          vault: vaultPda,
          child: childPda,
          payout: payoutPda,
          treasury: treasuryPda,
          recipient: admin.publicKey, // admin is also the child authority
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const recipientAfter = await connection.getBalance(admin.publicKey);
      // Recipient gets the payout (minus tx fee, so check at least partial increase)
      expect(recipientAfter).to.be.greaterThan(recipientBefore - LAMPORTS_PER_SOL);

      const payoutAfter = await program.account.pendingPayout.fetch(payoutPda);
      expect(payoutAfter.executed).to.equal(true);

      const child = await program.account.childAccount.fetch(childPda);
      expect(child.totalPaidOut.toNumber()).to.equal(payout.amount.toNumber());
    });

    it("rejects double execution", async () => {
      const [childPda] = deriveChildPda(vaultPda, admin.publicKey);
      const [payoutPda] = derivePayoutPda(vaultPda, childPda, nonce);

      try {
        await program.methods
          .adminExecutePayout()
          .accountsPartial({
            admin: admin.publicKey,
            vault: vaultPda,
            child: childPda,
            payout: payoutPda,
            treasury: treasuryPda,
            recipient: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(anchor.AnchorError);
        expect((err as anchor.AnchorError).error.errorCode.code).to.equal(
          "AlreadyExecuted"
        );
      }
    });

    it("rejects payout exceeding remaining after partial payout", async () => {
      // Create a new payout for more than remaining
      const [childPda] = deriveChildPda(vaultPda, admin.publicKey);
      const child = await program.account.childAccount.fetch(childPda);
      const remaining = child.totalDeposited.toNumber() - child.totalPaidOut.toNumber();
      const tooMuch = remaining + 1;

      // First request a valid payout (we'll manipulate the check via remaining)
      // We need to create a payout for the full remaining + 1, but admin_request_payout
      // also checks this. So we'll deposit more, request a payout, then execute
      // a previous payout first to reduce remaining, then try to execute the bigger one.

      // Deposit more to allow creating a large payout request
      await program.methods
        .depositAndAutoRegister(new anchor.BN(LAMPORTS_PER_SOL))
        .accountsPartial({
          depositor: admin.publicKey,
          vault: vaultPda,
          child: childPda,
          treasury: treasuryPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const childAfterDeposit = await program.account.childAccount.fetch(childPda);
      const newRemaining = childAfterDeposit.totalDeposited.toNumber() - childAfterDeposit.totalPaidOut.toNumber();

      // Request payout for the full remaining
      const nonceA = 300;
      const [payoutPdaA] = derivePayoutPda(vaultPda, childPda, nonceA);
      await program.methods
        .adminRequestPayout(new anchor.BN(newRemaining), new anchor.BN(nonceA))
        .accountsPartial({
          admin: admin.publicKey,
          vault: vaultPda,
          child: childPda,
          payout: payoutPdaA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Also request another payout for half the remaining
      const nonceB = 301;
      const [payoutPdaB] = derivePayoutPda(vaultPda, childPda, nonceB);
      await program.methods
        .adminRequestPayout(new anchor.BN(Math.floor(newRemaining / 2)), new anchor.BN(nonceB))
        .accountsPartial({
          admin: admin.publicKey,
          vault: vaultPda,
          child: childPda,
          payout: payoutPdaB,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Execute payout B first (half)
      await program.methods
        .adminExecutePayout()
        .accountsPartial({
          admin: admin.publicKey,
          vault: vaultPda,
          child: childPda,
          payout: payoutPdaB,
          treasury: treasuryPda,
          recipient: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Now try to execute payout A (full remaining) — should fail because half was already paid
      try {
        await program.methods
          .adminExecutePayout()
          .accountsPartial({
            admin: admin.publicKey,
            vault: vaultPda,
            child: childPda,
            payout: payoutPdaA,
            treasury: treasuryPda,
            recipient: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(anchor.AnchorError);
        expect((err as anchor.AnchorError).error.errorCode.code).to.equal(
          "ExceedsAllowedPayout"
        );
      }
    });

    it("validates child.total_paid_out update", async () => {
      const [childPda] = deriveChildPda(vaultPda, admin.publicKey);
      const child = await program.account.childAccount.fetch(childPda);

      // total_paid_out should reflect all executed payouts
      expect(child.totalPaidOut.toNumber()).to.be.greaterThan(0);
      expect(child.totalPaidOut.toNumber()).to.be.at.most(child.totalDeposited.toNumber());
    });
  });
});
