use anchor_lang::prelude::*;

use crate::events::VaultInitialized;
use crate::state::Vault;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

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

pub fn handler(ctx: Context<Initialize>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    vault.admin = ctx.accounts.admin.key();
    vault.total_deposited = 0;
    vault.total_withdrawn = 0;
    vault.created_at = clock.unix_timestamp;
    vault.vault_bump = ctx.bumps.vault;
    vault.treasury_bump = ctx.bumps.treasury;

    emit!(VaultInitialized {
        admin: vault.admin,
        vault: vault.key(),
        timestamp: vault.created_at,
    });

    Ok(())
}
