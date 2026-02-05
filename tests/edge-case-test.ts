import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { VaultProject } from "../target/types/vault_project";
import {
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Keypair
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress
} from "@solana/spl-token";

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.VaultProject as Program<VaultProject>;

async function main() {
  // Generate new admin for this test (to get fresh vault)
  const adminKeypair = Keypair.generate();
  const admin = adminKeypair.publicKey;
  const adminDestination = Keypair.generate().publicKey;

  console.log("=== Edge Case Test: Max Supply ===");
  console.log("Admin:", admin.toBase58());

  // Fund the new admin via transfer (airdrop has rate limits)
  console.log("\nFunding test admin via transfer...");
  const transferTx = new anchor.web3.Transaction().add(
    anchor.web3.SystemProgram.transfer({
      fromPubkey: provider.wallet.publicKey,
      toPubkey: admin,
      lamports: 0.3 * LAMPORTS_PER_SOL,
    })
  );
  await provider.sendAndConfirm(transferTx);
  console.log("✓ Transferred 0.3 SOL to test admin");

  const balance = await provider.connection.getBalance(admin);
  console.log("Admin balance:", balance / LAMPORTS_PER_SOL, "SOL");

  // Derive PDAs
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), admin.toBuffer()],
    program.programId
  );
  const [treasury] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), vault.toBuffer()],
    program.programId
  );
  const [valMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("val_mint"), vault.toBuffer()],
    program.programId
  );
  const [mintAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("mint_authority"), vault.toBuffer()],
    program.programId
  );

  console.log("\n--- PDAs ---");
  console.log("Vault:", vault.toBase58());

  // === Initialize with SMALL max_supply ===
  // Only 15 VAL max supply (at 100 VAL/SOL rate)
  const maxSupply = new anchor.BN(15).mul(new anchor.BN(LAMPORTS_PER_SOL));

  console.log("\n--- Test: Initialize with Small Max Supply ---");
  console.log("Max Supply: 15 VAL");
  console.log("Rate: 100 VAL per 1 SOL");

  await program.methods
    .initialize(
      new anchor.BN(100),  // numerator
      new anchor.BN(1),    // denominator
      maxSupply
    )
    .accounts({
      admin,
      adminDestination,
      vault,
      treasury,
      systemProgram: SystemProgram.programId,
    })
    .signers([adminKeypair])
    .rpc();
  console.log("✓ Vault initialized with 15 VAL max supply");

  // Initialize mint
  await program.methods
    .initializeValMint()
    .accounts({
      admin,
      vault,
      valMint,
      mintAuthority,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([adminKeypair])
    .rpc();
  console.log("✓ VAL mint initialized");

  const userValAta = await getAssociatedTokenAddress(valMint, admin);

  // === Buy 0.1 SOL worth = 10 VAL (should succeed) ===
  console.log("\n--- Test: Buy 10 VAL (should succeed, 10/15 used) ---");
  await program.methods
    .buyVal(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
    .accounts({
      user: admin,
      vault,
      treasury,
      valMint,
      mintAuthority,
      userValAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([adminKeypair])
    .rpc();
  console.log("✓ Bought 10 VAL successfully");

  // Check state
  let vaultState = await program.account.vault.fetch(vault);
  console.log("  total_minted:", (Number(vaultState.totalMinted) / LAMPORTS_PER_SOL).toFixed(2), "VAL");
  console.log("  remaining:", (Number(vaultState.maxSupply) - Number(vaultState.totalMinted)) / LAMPORTS_PER_SOL, "VAL");

  // === Try to buy 0.1 SOL worth = 10 VAL (should FAIL - exceeds max) ===
  console.log("\n--- Test: Buy 10 more VAL (should FAIL - only 5 remaining) ---");
  try {
    await program.methods
      .buyVal(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
      .accounts({
        user: admin,
        vault,
        treasury,
        valMint,
        mintAuthority,
        userValAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([adminKeypair])
      .rpc();
    console.log("✗ ERROR: Should have failed but succeeded!");
    process.exit(1);
  } catch (e: any) {
    if (e.error?.errorCode?.code === "ExceedsMaxSupply") {
      console.log("✓ Correctly rejected: ExceedsMaxSupply");
    } else {
      console.log("✗ Unexpected error:", e.message);
      throw e;
    }
  }

  // === Buy exactly remaining 5 VAL (0.05 SOL) ===
  console.log("\n--- Test: Buy exactly 5 VAL (should succeed - fills max) ---");
  await program.methods
    .buyVal(new anchor.BN(0.05 * LAMPORTS_PER_SOL))
    .accounts({
      user: admin,
      vault,
      treasury,
      valMint,
      mintAuthority,
      userValAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([adminKeypair])
    .rpc();
  console.log("✓ Bought exactly 5 VAL - max supply reached");

  // Final state
  vaultState = await program.account.vault.fetch(vault);
  console.log("\n--- Final State ---");
  console.log("  total_minted:", (Number(vaultState.totalMinted) / LAMPORTS_PER_SOL).toFixed(2), "VAL");
  console.log("  max_supply:", (Number(vaultState.maxSupply) / LAMPORTS_PER_SOL).toFixed(2), "VAL");
  console.log("  remaining:", (Number(vaultState.maxSupply) - Number(vaultState.totalMinted)) / LAMPORTS_PER_SOL, "VAL");

  // === Try to buy any more (should FAIL) ===
  console.log("\n--- Test: Buy 1 more VAL (should FAIL - max reached) ---");
  try {
    await program.methods
      .buyVal(new anchor.BN(0.01 * LAMPORTS_PER_SOL))
      .accounts({
        user: admin,
        vault,
        treasury,
        valMint,
        mintAuthority,
        userValAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([adminKeypair])
      .rpc();
    console.log("✗ ERROR: Should have failed!");
    process.exit(1);
  } catch (e: any) {
    if (e.error?.errorCode?.code === "ExceedsMaxSupply") {
      console.log("✓ Correctly rejected: ExceedsMaxSupply (max supply reached)");
    } else {
      console.log("✗ Unexpected error:", e.message);
      throw e;
    }
  }

  console.log("\n=== All Edge Case Tests Passed! ===\n");
}

main().catch((e) => {
  console.error("\n=== Test Failed ===");
  console.error(e);
  process.exit(1);
});
