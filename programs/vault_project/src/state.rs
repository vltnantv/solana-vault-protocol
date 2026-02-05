use anchor_lang::prelude::*;

#[account]
pub struct Vault {
    /// The admin authority who controls the vault.
    pub admin_authority: Pubkey,
    /// Fixed destination for admin withdrawals (SOL goes here only).
    pub admin_destination: Pubkey,
    /// Exchange rate numerator: val_amount = sol_lamports * numerator / denominator
    pub val_per_sol_numerator: u64,
    /// Exchange rate denominator: val_amount = sol_lamports * numerator / denominator
    pub val_per_sol_denominator: u64,
    /// Maximum VAL tokens that can ever be minted (in smallest units).
    pub max_supply: u64,
    /// Total VAL tokens minted so far (in smallest units).
    pub total_minted: u64,
    /// Running total of all SOL deposits (lamports).
    pub total_deposited: u64,
    /// Running total of all SOL withdrawals (lamports).
    pub total_withdrawn: u64,
    /// Unix timestamp when the vault was created.
    pub created_at: i64,
    /// Bump seed for the vault PDA.
    pub vault_bump: u8,
    /// Bump seed for the treasury PDA.
    pub treasury_bump: u8,
}

impl Vault {
    pub const LEN: usize = 8   // anchor discriminator
        + 32  // admin_authority
        + 32  // admin_destination
        + 8   // val_per_sol_numerator
        + 8   // val_per_sol_denominator
        + 8   // max_supply
        + 8   // total_minted
        + 8   // total_deposited
        + 8   // total_withdrawn
        + 8   // created_at
        + 1   // vault_bump
        + 1;  // treasury_bump

    pub const SEED_PREFIX: &'static [u8] = b"vault";
    pub const TREASURY_SEED: &'static [u8] = b"treasury";
}

pub const CHILD_SEED: &[u8] = b"child";
pub const PAYOUT_SEED: &[u8] = b"payout";
pub const VAL_MINT_SEED: &[u8] = b"val_mint";
pub const MINT_AUTHORITY_SEED: &[u8] = b"mint_authority";

#[account]
pub struct ChildAccount {
    pub vault: Pubkey,           // 32
    pub authority: Pubkey,       // 32
    pub total_deposited: u64,    // 8
    pub total_paid_out: u64,     // 8
    pub created_at: i64,         // 8
    pub bump: u8,                // 1
}

impl ChildAccount {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 8 + 8 + 1; // 97
}

#[account]
pub struct PendingPayout {
    pub vault: Pubkey,           // 32
    pub child: Pubkey,           // 32
    pub amount: u64,             // 8
    pub requested_at: i64,       // 8
    pub executed: bool,          // 1
    pub bump: u8,                // 1
}

impl PendingPayout {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 8 + 1 + 1; // 90
}
