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
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::handler(ctx)
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
}
