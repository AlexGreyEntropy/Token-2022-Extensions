use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022, TransferChecked};
use anchor_spl::token_interface::{Mint, TokenAccount};
use spl_token_2022::extension::{
    transfer_fee::TransferFeeConfig,
    ExtensionType,
};

pub fn create_mint_with_transfer_fee(
    ctx: Context<CreateMintWithTransferFee>,
    transfer_fee_config_authority: Option<Pubkey>,
    withdraw_withheld_authority: Option<Pubkey>,
    transfer_fee_basis_points: u16,
    maximum_fee: u64,
    decimals: u8,
) -> Result<()> {
    let mint = &ctx.accounts.mint;
    let mint_authority = &ctx.accounts.mint_authority;
    let rent = &ctx.accounts.rent;
    let system_program = &ctx.accounts.system_program;
    let token_program = &ctx.accounts.token_program;
    
    // space for mint with transfer fee extension
    let space = ExtensionType::TransferFeeConfig.try_calculate_account_len::<spl_token_2022::state::Mint>(&[])?;
    
    // mint account
    let create_account_ix = anchor_lang::solana_program::system_instruction::create_account(
        &ctx.accounts.payer.key(),
        &mint.key(),
        rent.minimum_balance(space),
        space as u64,
        &token_program.key(),
    );
    
    anchor_lang::solana_program::program::invoke(
        &create_account_ix,
        &[
            ctx.accounts.payer.to_account_info(),
            mint.to_account_info(),
            system_program.to_account_info(),
        ],
    )?;
    
    // transfer fee config extension
    let init_transfer_fee_ix = spl_token_2022::instruction::initialize_transfer_fee_config(
        &token_program.key(),
        &mint.key(),
        transfer_fee_config_authority.as_ref(),
        withdraw_withheld_authority.as_ref(),
        transfer_fee_basis_points,
        maximum_fee,
    )?;
    
    anchor_lang::solana_program::program::invoke(
        &init_transfer_fee_ix,
        &[
            mint.to_account_info(),
        ],
    )?;
    
    // mint
    let init_mint_ix = spl_token_2022::instruction::initialize_mint2(
        &token_program.key(),
        &mint.key(),
        &mint_authority.key(),
        None,
        decimals,
    )?;
    
    anchor_lang::solana_program::program::invoke(
        &init_mint_ix,
        &[
            mint.to_account_info(),
            rent.to_account_info(),
        ],
    )?;
    
    Ok(())
}

pub fn transfer_with_fee(
    ctx: Context<TransferWithFee>,
    amount: u64,
    expected_fee: u64,
) -> Result<()> {
    let transfer_ix = spl_token_2022::instruction::transfer_checked_with_fee(
        &ctx.accounts.token_program.key(),
        &ctx.accounts.source.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.destination.key(),
        &ctx.accounts.authority.key(),
        &[],
        amount,
        ctx.accounts.mint.decimals,
        expected_fee,
    )?;
    
    anchor_lang::solana_program::program::invoke_signed(
        &transfer_ix,
        &[
            ctx.accounts.source.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.destination.to_account_info(),
            ctx.accounts.authority.to_account_info(),
        ],
        &[],
    )?;
    
    Ok(())
}

pub fn withdraw_withheld_tokens(ctx: Context<WithdrawWithheldTokens>) -> Result<()> {
    let withdraw_ix = spl_token_2022::instruction::withdraw_withheld_tokens_from_accounts(
        &ctx.accounts.token_program.key(),
        &ctx.accounts.destination.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.withdraw_withheld_authority.key(),
        &[],
        &[&ctx.accounts.source.key()],
    )?;
    
    anchor_lang::solana_program::program::invoke_signed(
        &withdraw_ix,
        &[
            ctx.accounts.destination.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.source.to_account_info(),
            ctx.accounts.withdraw_withheld_authority.to_account_info(),
        ],
        &[],
    )?;
    
    Ok(())
}

#[derive(Accounts)]
pub struct CreateMintWithTransferFee<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]

    // account initialized by the token program
    pub mint: AccountInfo<'info>,
    pub mint_authority: Signer<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct TransferWithFee<'info> {
    #[account(mut)]
    pub source: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub destination: Box<InterfaceAccount<'info, TokenAccount>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct WithdrawWithheldTokens<'info> {
    #[account(mut)]
    pub source: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub destination: Box<InterfaceAccount<'info, TokenAccount>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub withdraw_withheld_authority: Signer<'info>,
    pub token_program: Program<'info, Token2022>,
} 