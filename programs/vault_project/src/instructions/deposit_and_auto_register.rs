use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::errors::VaultError;
use crate::events::DepositMade;
use crate::state::{ChildAccount, Vault, CHILD_SEED};

#[derive(Accounts)]
pub struct DepositAndAutoRegister<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        mut,
        seeds = [Vault::SEED_PREFIX, vault.admin.as_ref()],
        bump = vault.vault_bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        init_if_needed,
        payer = depositor,
        space = ChildAccount::LEN,
        seeds = [CHILD_SEED, vault.key().as_ref(), depositor.key().as_ref()],
        bump,
    )]
    pub child: Account<'info, ChildAccount>,

    /// CHECK: Treasury PDA that holds SOL. Validated by seeds derivation.
    #[account(
        mut,
        seeds = [Vault::TREASURY_SEED, vault.key().as_ref()],
        bump = vault.treasury_bump,
    )]
    pub treasury: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<DepositAndAutoRegister>, amount: u64) -> Result<()> {
    require!(amount > 0, VaultError::InvalidAmount);

    let child = &mut ctx.accounts.child;

    // If this child was just initialized, set its fields
    if child.vault == Pubkey::default() {
        child.vault = ctx.accounts.vault.key();
        child.authority = ctx.accounts.depositor.key();
        child.total_deposited = 0;
        child.total_paid_out = 0;
        child.created_at = Clock::get()?.unix_timestamp;
        child.bump = ctx.bumps.child;
    }

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

    child.total_deposited = child
        .total_deposited
        .checked_add(amount)
        .ok_or(VaultError::MathOverflow)?;

    emit!(DepositMade {
        depositor: ctx.accounts.depositor.key(),
        vault: ctx.accounts.vault.key(),
        child: child.key(),
        amount,
        child_total_deposited: child.total_deposited,
    });

    Ok(())
}
