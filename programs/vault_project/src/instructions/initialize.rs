use anchor_lang::prelude::*;

use crate::errors::VaultError;
use crate::events::VaultInitialized;
use crate::state::Vault;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: The destination address for admin withdrawals. Can be any valid pubkey.
    pub admin_destination: UncheckedAccount<'info>,

    #[account(
        init,
        payer = admin,
        space = Vault::LEN,
        seeds = [Vault::SEED_PREFIX, admin.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, Vault>,

    /// CHECK: Treasury PDA that will hold SOL. Validated by seeds derivation.
    #[account(
        seeds = [Vault::TREASURY_SEED, vault.key().as_ref()],
        bump,
    )]
    pub treasury: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Initialize>,
    val_per_sol_numerator: u64,
    val_per_sol_denominator: u64,
    max_supply: u64,
) -> Result<()> {
    require!(val_per_sol_numerator > 0, VaultError::InvalidNumerator);
    require!(val_per_sol_denominator > 0, VaultError::InvalidDenominator);

    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    vault.admin_authority = ctx.accounts.admin.key();
    vault.admin_destination = ctx.accounts.admin_destination.key();
    vault.val_per_sol_numerator = val_per_sol_numerator;
    vault.val_per_sol_denominator = val_per_sol_denominator;
    vault.max_supply = max_supply;
    vault.total_minted = 0;
    vault.total_deposited = 0;
    vault.total_withdrawn = 0;
    vault.created_at = clock.unix_timestamp;
    vault.vault_bump = ctx.bumps.vault;
    vault.treasury_bump = ctx.bumps.treasury;

    emit!(VaultInitialized {
        admin: vault.admin_authority,
        vault: vault.key(),
        timestamp: vault.created_at,
    });

    Ok(())
}
