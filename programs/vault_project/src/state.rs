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
