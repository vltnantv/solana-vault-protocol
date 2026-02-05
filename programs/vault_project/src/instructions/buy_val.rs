use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};

use crate::errors::VaultError;
use crate::events::ValPurchased;
use crate::state::{Vault, MINT_AUTHORITY_SEED, VAL_MINT_SEED};

#[derive(Accounts)]
pub struct BuyVal<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [Vault::SEED_PREFIX, vault.admin_authority.as_ref()],
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

    #[account(
        mut,
        seeds = [VAL_MINT_SEED, vault.key().as_ref()],
        bump,
    )]
    pub val_mint: Account<'info, Mint>,

    /// CHECK: Mint authority PDA. Does not hold data; verified by seeds.
    #[account(
        seeds = [MINT_AUTHORITY_SEED, vault.key().as_ref()],
        bump,
    )]
    pub mint_authority: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = val_mint,
        associated_token::authority = user,
    )]
    pub user_val_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<BuyVal>, sol_lamports: u64) -> Result<()> {
    let vault = &ctx.accounts.vault;

    // Validations
    require!(sol_lamports > 0, VaultError::InvalidAmount);
    require!(vault.val_per_sol_denominator > 0, VaultError::InvalidDenominator);

    // Calculate VAL amount: val_amount = sol_lamports * numerator / denominator
    // Using checked math to prevent overflow
    let val_amount = sol_lamports
        .checked_mul(vault.val_per_sol_numerator)
        .ok_or(VaultError::MathOverflow)?
        .checked_div(vault.val_per_sol_denominator)
        .ok_or(VaultError::MathOverflow)?;

    // Check max supply constraint
    let new_total_minted = vault
        .total_minted
        .checked_add(val_amount)
        .ok_or(VaultError::MathOverflow)?;
    require!(
        new_total_minted <= vault.max_supply,
        VaultError::ExceedsMaxSupply
    );

    // Transfer SOL from user to treasury
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
            },
        ),
        sol_lamports,
    )?;

    // PDA-signed mint: mint_authority signs the mint_to CPI
    let vault_key = ctx.accounts.vault.key();
    let mint_authority_seeds: &[&[u8]] = &[
        MINT_AUTHORITY_SEED,
        vault_key.as_ref(),
        &[ctx.bumps.mint_authority],
    ];

    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.val_mint.to_account_info(),
                to: ctx.accounts.user_val_ata.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            &[mint_authority_seeds],
        ),
        val_amount,
    )?;

    // Update total_minted in vault state
    let vault = &mut ctx.accounts.vault;
    vault.total_minted = new_total_minted;

    emit!(ValPurchased {
        user: ctx.accounts.user.key(),
        vault: vault.key(),
        sol_amount: sol_lamports,
        val_amount,
        total_minted: vault.total_minted,
    });

    Ok(())
}
