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

    #[msg("Insufficient funds in treasury")]
    InsufficientFunds,

    #[msg("Minting would exceed max supply")]
    ExceedsMaxSupply,

    #[msg("Invalid exchange rate: numerator must be > 0")]
    InvalidNumerator,

    #[msg("Invalid exchange rate: denominator must be > 0")]
    InvalidDenominator,
}
