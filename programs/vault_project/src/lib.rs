use anchor_lang::prelude::*;

mod errors;
mod events;
mod instructions;
mod state;

use instructions::*;

declare_id!("8ZddStKAumEMQQ8nHViTCxBU7AYnxt8rACHJqWg53vsG");

#[program]
pub mod vault_project {
    use super::*;

    /// Creates a new admin-controlled vault with a dedicated treasury PDA.
    /// Parameters:
    /// - val_per_sol_numerator: Exchange rate numerator (val = sol * num / denom)
    /// - val_per_sol_denominator: Exchange rate denominator
    /// - max_supply: Maximum VAL tokens that can be minted
    pub fn initialize(
        ctx: Context<Initialize>,
        val_per_sol_numerator: u64,
        val_per_sol_denominator: u64,
        max_supply: u64,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, val_per_sol_numerator, val_per_sol_denominator, max_supply)
    }

    /// Deposits SOL into the vault treasury. Auto-registers a child account on first deposit.
    pub fn deposit_and_auto_register(
        ctx: Context<DepositAndAutoRegister>,
        amount: u64,
    ) -> Result<()> {
        instructions::deposit_and_auto_register::handler(ctx, amount)
    }

    /// Admin requests a payout from a child account's deposited balance.
    pub fn admin_request_payout(
        ctx: Context<AdminRequestPayout>,
        amount: u64,
        nonce: u64,
    ) -> Result<()> {
        instructions::admin_request_payout::handler(ctx, amount, nonce)
    }

    /// Admin executes a previously requested payout.
    pub fn admin_execute_payout(ctx: Context<AdminExecutePayout>) -> Result<()> {
        instructions::admin_execute_payout::handler(ctx)
    }

    /// Admin withdraws SOL from treasury to the fixed admin_destination.
    /// No destination parameter - SOL can ONLY go to vault.admin_destination.
    pub fn admin_withdraw(ctx: Context<AdminWithdraw>, amount: u64) -> Result<()> {
        instructions::admin_withdraw::handler(ctx, amount)
    }

    /// Initializes the VAL token mint for a vault.
    pub fn initialize_val_mint(ctx: Context<InitializeValMint>) -> Result<()> {
        instructions::initialize_val_mint::handler(ctx)
    }

    /// Buy VAL tokens by sending SOL to the vault treasury.
    /// Calculates: val_amount = sol_lamports * numerator / denominator
    pub fn buy_val(ctx: Context<BuyVal>, sol_lamports: u64) -> Result<()> {
        instructions::buy_val::handler(ctx, sol_lamports)
    }

    /// Admin updates the exchange rate.
    /// Both numerator and denominator must be > 0.
    pub fn update_exchange_rate(
        ctx: Context<UpdateExchangeRate>,
        new_numerator: u64,
        new_denominator: u64,
    ) -> Result<()> {
        instructions::update_exchange_rate::handler(ctx, new_numerator, new_denominator)
    }
}
