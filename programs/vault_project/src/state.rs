use anchor_lang::prelude::*;

#[account]
pub struct Vault {
    /// The admin authority who controls withdrawals.
    pub admin: Pubkey,
    /// Running total of all deposits (lamports).
    pub total_deposited: u64,
    /// Running total of all withdrawals (lamports).
    pub total_withdrawn: u64,
    /// Unix timestamp when the vault was created.
    pub created_at: i64,
    /// Bump seed for the vault PDA.
    pub vault_bump: u8,
    /// Bump seed for the treasury PDA.
    pub treasury_bump: u8,
}

impl Vault {
    pub const LEN: usize = 8  // anchor discriminator
        + 32 // admin
        + 8  // total_deposited
        + 8  // total_withdrawn
        + 8  // created_at
        + 1  // vault_bump
        + 1; // treasury_bump

    pub const SEED_PREFIX: &'static [u8] = b"vault";
    pub const TREASURY_SEED: &'static [u8] = b"treasury";
}

pub const CHILD_SEED: &[u8] = b"child";
pub const PAYOUT_SEED: &[u8] = b"payout";

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
