use anchor_lang::prelude::*;

use crate::errors::VaultError;
use crate::events::RateUpdated;
use crate::state::Vault;

#[derive(Accounts)]
pub struct UpdateExchangeRate<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [Vault::SEED_PREFIX, admin.key().as_ref()],
        bump = vault.vault_bump,
        constraint = vault.admin_authority == admin.key() @ VaultError::Unauthorized,
    )]
    pub vault: Account<'info, Vault>,
}

pub fn handler(
    ctx: Context<UpdateExchangeRate>,
    new_numerator: u64,
    new_denominator: u64,
) -> Result<()> {
    require!(new_numerator > 0, VaultError::InvalidNumerator);
    require!(new_denominator > 0, VaultError::InvalidDenominator);

    let vault = &mut ctx.accounts.vault;

    let old_numerator = vault.val_per_sol_numerator;
    let old_denominator = vault.val_per_sol_denominator;

    vault.val_per_sol_numerator = new_numerator;
    vault.val_per_sol_denominator = new_denominator;

    emit!(RateUpdated {
        admin: ctx.accounts.admin.key(),
        vault: vault.key(),
        old_numerator,
        old_denominator,
        new_numerator,
        new_denominator,
    });

    Ok(())
}
