use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Unauthorized")]
    Unauthorized,

    #[msg("Invalid amount")]
    InvalidAmount,

    #[msg("Payout exceeds allowed remaining balance")]
    ExceedsAllowedPayout,

    #[msg("Payout already executed")]
    AlreadyExecuted,

    #[msg("Math overflow")]
    MathOverflow,
}
