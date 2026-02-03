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
    pub child: Pubkey,
    pub amount: u64,
    pub child_total_deposited: u64,
}

#[event]
pub struct PayoutRequested {
    pub admin: Pubkey,
    pub vault: Pubkey,
    pub child: Pubkey,
    pub payout: Pubkey,
    pub amount: u64,
}

#[event]
pub struct PayoutExecuted {
    pub admin: Pubkey,
    pub vault: Pubkey,
    pub child: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub child_total_paid_out: u64,
}
