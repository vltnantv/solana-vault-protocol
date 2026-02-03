use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::errors::VaultError;
use crate::events::PayoutExecuted;
use crate::state::{ChildAccount, PendingPayout, Vault};

#[derive(Accounts)]
pub struct AdminExecutePayout<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [Vault::SEED_PREFIX, admin.key().as_ref()],
        bump = vault.vault_bump,
        has_one = admin @ VaultError::Unauthorized,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        constraint = child.vault == vault.key() @ VaultError::Unauthorized,
    )]
    pub child: Account<'info, ChildAccount>,

    #[account(
        mut,
        constraint = payout.vault == vault.key() @ VaultError::Unauthorized,
        constraint = payout.child == child.key() @ VaultError::Unauthorized,
    )]
    pub payout: Account<'info, PendingPayout>,

    /// CHECK: Treasury PDA that holds SOL. Validated by seeds derivation.
    #[account(
        mut,
        seeds = [Vault::TREASURY_SEED, vault.key().as_ref()],
        bump = vault.treasury_bump,
    )]
    pub treasury: SystemAccount<'info>,

    /// CHECK: Recipient must be the child's authority.
    #[account(
        mut,
        constraint = recipient.key() == child.authority @ VaultError::Unauthorized,
    )]
    pub recipient: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AdminExecutePayout>) -> Result<()> {
    let payout = &ctx.accounts.payout;
    let child = &ctx.accounts.child;

    require!(!payout.executed, VaultError::AlreadyExecuted);

    let remaining = child
        .total_deposited
        .checked_sub(child.total_paid_out)
        .ok_or(VaultError::MathOverflow)?;

    require!(payout.amount <= remaining, VaultError::ExceedsAllowedPayout);
    require!(
        ctx.accounts.treasury.lamports() >= payout.amount,
        VaultError::InvalidAmount
    );

    // PDA-signed transfer: treasury → recipient
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
                to: ctx.accounts.recipient.to_account_info(),
            },
            &[treasury_seeds],
        ),
        payout.amount,
    )?;

    let child = &mut ctx.accounts.child;
    child.total_paid_out = child
        .total_paid_out
        .checked_add(payout.amount)
        .ok_or(VaultError::MathOverflow)?;

    let payout = &mut ctx.accounts.payout;
    payout.executed = true;

    emit!(PayoutExecuted {
        admin: ctx.accounts.admin.key(),
        vault: ctx.accounts.vault.key(),
        child: ctx.accounts.child.key(),
        recipient: ctx.accounts.recipient.key(),
        amount: payout.amount,
        child_total_paid_out: ctx.accounts.child.total_paid_out,
    });

    Ok(())
}
