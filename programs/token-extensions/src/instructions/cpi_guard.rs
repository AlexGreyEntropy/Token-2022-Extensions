use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022};
use anchor_spl::token_interface::TokenAccount;
use spl_token_2022::extension::{
    cpi_guard::CpiGuard,
    ExtensionType,
};

pub fn enable_cpi_guard(ctx: Context<EnableCpiGuard>) -> Result<()> {
    let enable_cpi_guard_ix = spl_token_2022::instruction::enable_cpi_guard(
        &ctx.accounts.token_program.key(),
        &ctx.accounts.token_account.key(),
        &ctx.accounts.owner.key(),
        &[],
    )?;
    
    anchor_lang::solana_program::program::invoke_signed(
        &enable_cpi_guard_ix,
        &[
            ctx.accounts.token_account.to_account_info(),
            ctx.accounts.owner.to_account_info(),
        ],
        &[],
    )?;
    
    Ok(())
}

pub fn disable_cpi_guard(ctx: Context<DisableCpiGuard>) -> Result<()> {
    let disable_cpi_guard_ix = spl_token_2022::instruction::disable_cpi_guard(
        &ctx.accounts.token_program.key(),
        &ctx.accounts.token_account.key(),
        &ctx.accounts.owner.key(),
        &[],
    )?;
    
    anchor_lang::solana_program::program::invoke_signed(
        &disable_cpi_guard_ix,
        &[
            ctx.accounts.token_account.to_account_info(),
            ctx.accounts.owner.to_account_info(),
        ],
        &[],
    )?;
    
    Ok(())
}

#[derive(Accounts)]
pub struct EnableCpiGuard<'info> {
    #[account(mut)]
    pub token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct DisableCpiGuard<'info> {
    #[account(mut)]
    pub token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token2022>,
} 