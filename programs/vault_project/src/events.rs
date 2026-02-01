use anchor_lang::prelude::*;

#[event]
pub struct VaultInitialized {
    pub admin: Pubkey,
    pub vault: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct DepositMade {
    pub depositor: Pubkey,
    pub vault: Pubkey,
    pub amount: u64,
    pub total_deposited: u64,
}

#[event]
pub struct WithdrawalMade {
    pub admin: Pubkey,
    pub vault: Pubkey,
    pub amount: u64,
    pub total_withdrawn: u64,
}
