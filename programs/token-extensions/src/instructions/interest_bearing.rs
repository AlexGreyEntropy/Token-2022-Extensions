use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022};
use anchor_spl::token_interface::Mint;
use spl_token_2022::extension::{
    interest_bearing_mint::InterestBearingConfig,
    ExtensionType,
};

pub fn create_interest_bearing_mint(
    ctx: Context<CreateInterestBearingMint>,
    rate_authority: Option<Pubkey>,
    rate: i16,
    decimals: u8,
) -> Result<()> {
    let mint = &ctx.accounts.mint;
    let mint_authority = &ctx.accounts.mint_authority;
    let rent = &ctx.accounts.rent;
    let system_program = &ctx.accounts.system_program;
    let token_program = &ctx.accounts.token_program;
    
    // space for mint with interest bearing extension
    let space = ExtensionType::InterestBearingConfig.try_calculate_account_len::<spl_token_2022::state::Mint>(&[])?;
    
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
    
    // init interest bearing config extension
    let init_interest_bearing_ix = spl_token_2022::instruction::initialize_interest_bearing_mint(
        &token_program.key(),
        &mint.key(),
        rate_authority.as_ref(),
        rate,
    )?;
    
    anchor_lang::solana_program::program::invoke(
        &init_interest_bearing_ix,
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

pub fn update_interest_rate(ctx: Context<UpdateInterestRate>, rate: i16) -> Result<()> {
    let update_rate_ix = spl_token_2022::instruction::update_rate_interest_bearing_mint(
        &ctx.accounts.token_program.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.rate_authority.key(),
        &[],
        rate,
    )?;
    
    anchor_lang::solana_program::program::invoke_signed(
        &update_rate_ix,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.rate_authority.to_account_info(),
        ],
        &[],
    )?;
    
    Ok(())
}

#[derive(Accounts)]
pub struct CreateInterestBearingMint<'info> {
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
pub struct UpdateInterestRate<'info> {
    #[account(mut)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub rate_authority: Signer<'info>,
    pub token_program: Program<'info, Token2022>,
} 