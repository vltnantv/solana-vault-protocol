use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::errors::VaultError;
use crate::events::AdminWithdrawal;
use crate::state::Vault;

#[derive(Accounts)]
pub struct AdminWithdraw<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [Vault::SEED_PREFIX, admin.key().as_ref()],
        bump = vault.vault_bump,
        constraint = vault.admin_authority == admin.key() @ VaultError::Unauthorized,
    )]
    pub vault: Account<'info, Vault>,

    /// CHECK: Treasury PDA that holds SOL. Validated by seeds derivation.
    #[account(
        mut,
        seeds = [Vault::TREASURY_SEED, vault.key().as_ref()],
        bump = vault.treasury_bump,
    )]
    pub treasury: SystemAccount<'info>,

    /// CHECK: Must match vault.admin_destination. SOL only goes here.
    #[account(
        mut,
        constraint = admin_destination.key() == vault.admin_destination @ VaultError::Unauthorized,
    )]
    pub admin_destination: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AdminWithdraw>, amount: u64) -> Result<()> {
    require!(amount > 0, VaultError::InvalidAmount);

    let treasury_lamports = ctx.accounts.treasury.lamports();
    require!(
        treasury_lamports >= amount,
        VaultError::InsufficientFunds
    );

    // PDA-signed transfer: treasury → admin_destination (NOT signer)
    let vault_key = ctx.accounts.vault.key();
    let treasury_seeds: &[&[u8]] = &[
        Vault::TREASURY_SEED,
        vault_key.as_ref(),
        &[ctx.accounts.vault.treasury_bump],
    ];

    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.treasury.to_account_info(),
                to: ctx.accounts.admin_destination.to_account_info(),
            },
            &[treasury_seeds],
        ),
        amount,
    )?;

    let vault = &mut ctx.accounts.vault;
    vault.total_withdrawn = vault
        .total_withdrawn
        .checked_add(amount)
        .ok_or(VaultError::MathOverflow)?;

    emit!(AdminWithdrawal {
        admin: ctx.accounts.admin.key(),
        vault: vault.key(),
        amount,
        vault_total_withdrawn: vault.total_withdrawn,
    });

    Ok(())
}
