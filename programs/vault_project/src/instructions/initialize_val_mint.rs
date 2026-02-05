use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};

use crate::errors::VaultError;
use crate::events::ValMintInitialized;
use crate::state::{Vault, VAL_MINT_SEED, MINT_AUTHORITY_SEED};

#[derive(Accounts)]
pub struct InitializeValMint<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [Vault::SEED_PREFIX, admin.key().as_ref()],
        bump = vault.vault_bump,
        constraint = vault.admin_authority == admin.key() @ VaultError::Unauthorized,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        init,
        payer = admin,
        seeds = [VAL_MINT_SEED, vault.key().as_ref()],
        bump,
        mint::decimals = 9,
        mint::authority = mint_authority,
    )]
    pub val_mint: Account<'info, Mint>,

    /// CHECK: Mint authority PDA. Does not hold data; verified by seeds.
    #[account(
        seeds = [MINT_AUTHORITY_SEED, vault.key().as_ref()],
        bump,
    )]
    pub mint_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeValMint>) -> Result<()> {
    emit!(ValMintInitialized {
        admin: ctx.accounts.admin.key(),
        vault: ctx.accounts.vault.key(),
        mint: ctx.accounts.val_mint.key(),
    });

    Ok(())
}
