use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Deposit amount must be greater than zero")]
    InvalidDepositAmount,

    #[msg("Withdrawal amount must be greater than zero")]
    InvalidWithdrawAmount,

    #[msg("Insufficient vault balance for withdrawal")]
    InsufficientBalance,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("Unauthorized: only the vault admin can perform this action")]
    Unauthorized,
}
