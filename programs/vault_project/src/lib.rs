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

    /// Deposits SOL into the vault treasury. Anyone can deposit.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit::handler(ctx, amount)
    }

    /// Withdraws SOL from the vault treasury. Admin-only.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        instructions::withdraw::handler(ctx, amount)
    }
}
