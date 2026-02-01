use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::errors::VaultError;
use crate::events::DepositMade;
use crate::state::Vault;

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        mut,
        seeds = [Vault::SEED_PREFIX, vault.admin.as_ref()],
        bump = vault.vault_bump,
    )]
    pub vault: Account<'info, Vault>,

    /// CHECK: Treasury PDA that holds SOL. Validated by seeds derivation.
    #[account(
        mut,
        seeds = [Vault::TREASURY_SEED, vault.key().as_ref()],
        bump = vault.treasury_bump,
    )]
    pub treasury: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, VaultError::InvalidDepositAmount);

    // Transfer SOL from depositor to treasury PDA
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.depositor.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
            },
        ),
        amount,
    )?;

    let vault = &mut ctx.accounts.vault;
    vault.total_deposited = vault
        .total_deposited
        .checked_add(amount)
        .ok_or(VaultError::ArithmeticOverflow)?;

    emit!(DepositMade {
        depositor: ctx.accounts.depositor.key(),
        vault: vault.key(),
        amount,
        total_deposited: vault.total_deposited,
    });

    Ok(())
}
