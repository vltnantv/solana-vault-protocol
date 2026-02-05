use anchor_lang::prelude::*;

use crate::errors::VaultError;
use crate::events::PayoutRequested;
use crate::state::{ChildAccount, PendingPayout, Vault, PAYOUT_SEED};

#[derive(Accounts)]
#[instruction(amount: u64, nonce: u64)]
pub struct AdminRequestPayout<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [Vault::SEED_PREFIX, admin.key().as_ref()],
        bump = vault.vault_bump,
        constraint = vault.admin_authority == admin.key() @ VaultError::Unauthorized,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        constraint = child.vault == vault.key() @ VaultError::Unauthorized,
    )]
    pub child: Account<'info, ChildAccount>,

    #[account(
        init,
        payer = admin,
        space = PendingPayout::LEN,
        seeds = [PAYOUT_SEED, vault.key().as_ref(), child.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub payout: Account<'info, PendingPayout>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AdminRequestPayout>, amount: u64, nonce: u64) -> Result<()> {
    let child = &ctx.accounts.child;

    let remaining = child
        .total_deposited
        .checked_sub(child.total_paid_out)
        .ok_or(VaultError::MathOverflow)?;

    require!(amount > 0, VaultError::InvalidAmount);
    require!(amount <= remaining, VaultError::ExceedsAllowedPayout);

    let payout = &mut ctx.accounts.payout;
    payout.vault = ctx.accounts.vault.key();
    payout.child = child.key();
    payout.amount = amount;
    payout.requested_at = Clock::get()?.unix_timestamp;
    payout.executed = false;
    payout.bump = ctx.bumps.payout;

    emit!(PayoutRequested {
        admin: ctx.accounts.admin.key(),
        vault: ctx.accounts.vault.key(),
        child: child.key(),
        payout: payout.key(),
        amount,
    });

    // Suppress unused variable warning
    let _ = nonce;

    Ok(())
}
