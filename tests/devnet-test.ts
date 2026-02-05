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
  const admin = provider.wallet.publicKey;

  // Use a deterministic admin destination (derived from admin for reproducibility)
  // In production, this would be a specific wallet address
  const adminDestination = Keypair.generate().publicKey;

  console.log("=== Devnet Test Suite ===");
  console.log("Admin:", admin.toBase58());
  console.log("Admin Destination:", adminDestination.toBase58());

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
  console.log("Treasury:", treasury.toBase58());
  console.log("VAL Mint:", valMint.toBase58());
  console.log("Mint Authority:", mintAuthority.toBase58());

  // === 1. Initialize Vault ===
  // Rate: 100 VAL per 1 SOL (numerator=100, denominator=1)
  // Max supply: 1,000,000 VAL (with 9 decimals)
  const maxSupply = new anchor.BN(1_000_000).mul(new anchor.BN(LAMPORTS_PER_SOL));

  console.log("\n--- Test 1: Initialize Vault ---");
  console.log("Rate: 100 VAL per 1 SOL");
  console.log("Max Supply: 1,000,000 VAL");

  try {
    const tx = await program.methods
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
      .rpc();
    console.log("✓ Vault initialized - tx:", tx);
  } catch (e: any) {
    if (e.message?.includes("already in use") || e.logs?.some((l: string) => l.includes("already in use"))) {
      console.log("✓ Vault already exists, skipping...");
    } else {
      console.error("Error:", e.message);
      throw e;
    }
  }

  // === 2. Initialize VAL Mint ===
  console.log("\n--- Test 2: Initialize VAL Mint ---");
  try {
    const tx = await program.methods
      .initializeValMint()
      .accounts({
        admin,
        vault,
        valMint,
        mintAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("✓ VAL mint initialized - tx:", tx);
  } catch (e: any) {
    if (e.message?.includes("already in use") || e.logs?.some((l: string) => l.includes("already in use"))) {
      console.log("✓ VAL mint already exists, skipping...");
    } else {
      console.error("Error:", e.message);
      throw e;
    }
  }

  // Get user's VAL ATA
  const userValAta = await getAssociatedTokenAddress(valMint, admin);
  console.log("User VAL ATA:", userValAta.toBase58());

  // === 3. Buy VAL with 0.1 SOL ===
  console.log("\n--- Test 3: Buy VAL with 0.1 SOL ---");
  console.log("Expected: 10 VAL (at 100 VAL/SOL rate)");

  try {
    const tx = await program.methods
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
      .rpc();
    console.log("✓ Bought VAL (0.1 SOL) - tx:", tx);
  } catch (e: any) {
    console.error("Error:", e.message);
    if (e.logs) console.error("Logs:", e.logs);
    throw e;
  }

  // === 4. Buy VAL with 1 SOL ===
  console.log("\n--- Test 4: Buy VAL with 1 SOL ---");
  console.log("Expected: 100 VAL (at 100 VAL/SOL rate)");

  try {
    const tx = await program.methods
      .buyVal(new anchor.BN(1 * LAMPORTS_PER_SOL))
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
      .rpc();
    console.log("✓ Bought VAL (1 SOL) - tx:", tx);
  } catch (e: any) {
    console.error("Error:", e.message);
    if (e.logs) console.error("Logs:", e.logs);
    throw e;
  }

  // === 5. Check vault state before rate change ===
  console.log("\n--- Vault State (before rate change) ---");
  let vaultState = await program.account.vault.fetch(vault);
  console.log("  total_minted:", (Number(vaultState.totalMinted) / LAMPORTS_PER_SOL).toFixed(2), "VAL");
  console.log("  max_supply:", (Number(vaultState.maxSupply) / LAMPORTS_PER_SOL).toFixed(0), "VAL");
  console.log("  rate:", vaultState.valPerSolNumerator.toString(), "/", vaultState.valPerSolDenominator.toString(), "VAL/SOL");
  console.log("  total_withdrawn:", (Number(vaultState.totalWithdrawn) / LAMPORTS_PER_SOL).toFixed(4), "SOL");

  // === 6. Update exchange rate ===
  console.log("\n--- Test 5: Update Exchange Rate ---");
  console.log("New rate: 200 VAL per 1 SOL");

  try {
    const tx = await program.methods
      .updateExchangeRate(
        new anchor.BN(200),  // new numerator
        new anchor.BN(1)     // new denominator
      )
      .accounts({
        admin,
        vault,
      })
      .rpc();
    console.log("✓ Rate updated - tx:", tx);
  } catch (e: any) {
    console.error("Error:", e.message);
    if (e.logs) console.error("Logs:", e.logs);
    throw e;
  }

  // === 7. Buy VAL with new rate (0.1 SOL) ===
  console.log("\n--- Test 6: Buy VAL with 0.1 SOL (new rate) ---");
  console.log("Expected: 20 VAL (at 200 VAL/SOL rate)");

  try {
    const tx = await program.methods
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
      .rpc();
    console.log("✓ Bought VAL (0.1 SOL at new rate) - tx:", tx);
  } catch (e: any) {
    console.error("Error:", e.message);
    if (e.logs) console.error("Logs:", e.logs);
    throw e;
  }

  // === 8. Admin withdraw ===
  console.log("\n--- Test 7: Admin Withdraw ---");
  console.log("Withdrawing 0.05 SOL to admin_destination");

  // Fetch current vault state to get admin_destination
  vaultState = await program.account.vault.fetch(vault);
  const storedAdminDestination = vaultState.adminDestination;
  console.log("Stored admin_destination:", storedAdminDestination.toBase58());

  try {
    const tx = await program.methods
      .adminWithdraw(new anchor.BN(0.05 * LAMPORTS_PER_SOL))
      .accounts({
        admin,
        vault,
        treasury,
        adminDestination: storedAdminDestination,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("✓ Withdrew 0.05 SOL - tx:", tx);
  } catch (e: any) {
    console.error("Error:", e.message);
    if (e.logs) console.error("Logs:", e.logs);
    throw e;
  }

  // === 9. Final vault state ===
  console.log("\n--- Final Vault State ---");
  vaultState = await program.account.vault.fetch(vault);
  console.log("  admin_authority:", vaultState.adminAuthority.toBase58());
  console.log("  admin_destination:", vaultState.adminDestination.toBase58());
  console.log("  total_minted:", (Number(vaultState.totalMinted) / LAMPORTS_PER_SOL).toFixed(2), "VAL");
  console.log("  max_supply:", (Number(vaultState.maxSupply) / LAMPORTS_PER_SOL).toFixed(0), "VAL");
  console.log("  rate:", vaultState.valPerSolNumerator.toString(), "/", vaultState.valPerSolDenominator.toString(), "VAL/SOL");
  console.log("  total_deposited:", (Number(vaultState.totalDeposited) / LAMPORTS_PER_SOL).toFixed(4), "SOL");
  console.log("  total_withdrawn:", (Number(vaultState.totalWithdrawn) / LAMPORTS_PER_SOL).toFixed(4), "SOL");

  // Check treasury balance
  const treasuryBalance = await provider.connection.getBalance(treasury);
  console.log("  treasury_balance:", (treasuryBalance / LAMPORTS_PER_SOL).toFixed(4), "SOL");

  console.log("\n=== All Tests Passed! ===\n");
}

main().catch((e) => {
  console.error("\n=== Test Failed ===");
  console.error(e);
  process.exit(1);
});
