use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022};
use anchor_spl::token_interface::Mint;
use spl_token_2022::extension::{
    ui_amount::UiAmountMintScaler,
    ExtensionType,
};

pub fn create_mint_with_scaled_ui_amount(
    ctx: Context<CreateMintWithScaledUiAmount>,
    authority: Option<Pubkey>,
    multiplier: f64,
    decimals: u8,
) -> Result<()> {
    let mint = &ctx.accounts.mint;
    let mint_authority = &ctx.accounts.mint_authority;
    let rent = &ctx.accounts.rent;
    let system_program = &ctx.accounts.system_program;
    let token_program = &ctx.accounts.token_program;
    
    // space for mint with UI amount scaler extension
    let space = ExtensionType::UiAmountMintScaler.try_calculate_account_len::<spl_token_2022::state::Mint>(&[])?;
    
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
    
    // init UI amount scaler extension
    let multiplier_bytes = multiplier.to_le_bytes();
    let init_ui_amount_ix = spl_token_2022::instruction::initialize_ui_amount_mint_scaler(
        &token_program.key(),
        &mint.key(),
        authority.as_ref(),
        &multiplier_bytes,
        0, // this is the effective timestamp (0 = immediate)
    )?;
    
    anchor_lang::solana_program::program::invoke(
        &init_ui_amount_ix,
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

pub fn update_ui_amount_multiplier(
    ctx: Context<UpdateUiAmountMultiplier>,
    multiplier: f64,
    effective_timestamp: Option<i64>,
) -> Result<()> {
    let multiplier_bytes = multiplier.to_le_bytes();
    let timestamp = effective_timestamp.unwrap_or(0);
    
    let update_multiplier_ix = spl_token_2022::instruction::update_ui_amount_mint_scaler(
        &ctx.accounts.token_program.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.authority.key(),
        &[],
        &multiplier_bytes,
        timestamp,
    )?;
    
    anchor_lang::solana_program::program::invoke_signed(
        &update_multiplier_ix,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.authority.to_account_info(),
        ],
        &[],
    )?;
    
    Ok(())
}

#[derive(Accounts)]
pub struct CreateMintWithScaledUiAmount<'info> {
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
pub struct UpdateUiAmountMultiplier<'info> {
    #[account(mut)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token2022>,
} 