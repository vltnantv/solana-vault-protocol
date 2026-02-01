use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::errors::VaultError;
use crate::events::WithdrawalMade;
use crate::state::Vault;

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [Vault::SEED_PREFIX, admin.key().as_ref()],
        bump = vault.vault_bump,
        has_one = admin @ VaultError::Unauthorized,
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

pub fn handler(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    require!(amount > 0, VaultError::InvalidWithdrawAmount);

    let treasury_balance = ctx.accounts.treasury.lamports();
    require!(treasury_balance >= amount, VaultError::InsufficientBalance);

    // Build PDA signer seeds for treasury
    let vault_key = ctx.accounts.vault.key();
    let treasury_seeds: &[&[u8]] = &[
        Vault::TREASURY_SEED,
        vault_key.as_ref(),
        &[ctx.accounts.vault.treasury_bump],
    ];

    // Transfer SOL from treasury to admin via PDA signing
    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.treasury.to_account_info(),
                to: ctx.accounts.admin.to_account_info(),
            },
            &[treasury_seeds],
        ),
        amount,
    )?;

    let vault = &mut ctx.accounts.vault;
    vault.total_withdrawn = vault
        .total_withdrawn
        .checked_add(amount)
        .ok_or(VaultError::ArithmeticOverflow)?;

    emit!(WithdrawalMade {
        admin: ctx.accounts.admin.key(),
        vault: vault.key(),
        amount,
        total_withdrawn: vault.total_withdrawn,
    });

    Ok(())
}
