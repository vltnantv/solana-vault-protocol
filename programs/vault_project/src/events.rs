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

#[event]
pub struct AdminWithdrawal {
    pub admin: Pubkey,
    pub vault: Pubkey,
    pub amount: u64,
    pub vault_total_withdrawn: u64,
}

#[event]
pub struct ValMintInitialized {
    pub admin: Pubkey,
    pub vault: Pubkey,
    pub mint: Pubkey,
}

#[event]
pub struct ValPurchased {
    pub user: Pubkey,
    pub vault: Pubkey,
    pub sol_amount: u64,
    pub val_amount: u64,
    pub total_minted: u64,
}

#[event]
pub struct RateUpdated {
    pub admin: Pubkey,
    pub vault: Pubkey,
    pub old_numerator: u64,
    pub old_denominator: u64,
    pub new_numerator: u64,
    pub new_denominator: u64,
}
