use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, MintTo, Token2022};
use anchor_spl::token_interface::{Mint, TokenAccount};
use spl_token_2022::extension::{
    mint_close_authority::MintCloseAuthority,
    ExtensionType,
};

pub fn create_mint_with_close_authority(
    ctx: Context<CreateMintWithCloseAuthority>,
    close_authority: Pubkey,
    decimals: u8,
) -> Result<()> {
    let mint = &ctx.accounts.mint;
    let mint_authority = &ctx.accounts.mint_authority;
    let rent = &ctx.accounts.rent;
    let system_program = &ctx.accounts.system_program;
    let token_program = &ctx.accounts.token_program;
    
    // space for mint with close authority extension
    let space = ExtensionType::MintCloseAuthority.try_calculate_account_len::<spl_token_2022::state::Mint>(&[])?;
    
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
    
    // init mint close authority extension
    let init_close_authority_ix = spl_token_2022::instruction::initialize_mint_close_authority(
        &token_program.key(),
        &mint.key(),
        Some(&close_authority),
    )?;
    
    anchor_lang::solana_program::program::invoke(
        &init_close_authority_ix,
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

pub fn close_mint(ctx: Context<CloseMint>) -> Result<()> {
    let close_mint_ix = spl_token_2022::instruction::close_account(
        &ctx.accounts.token_program.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.destination.key(),
        &ctx.accounts.close_authority.key(),
        &[],
    )?;
    
    anchor_lang::solana_program::program::invoke_signed(
        &close_mint_ix,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.destination.to_account_info(),
            ctx.accounts.close_authority.to_account_info(),
        ],
        &[],
    )?;
    
    Ok(())
}

#[derive(Accounts)]
pub struct CreateMintWithCloseAuthority<'info> {
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
pub struct CloseMint<'info> {
    #[account(mut)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]

    // account to receive the lamports
    pub destination: AccountInfo<'info>,
    pub close_authority: Signer<'info>,
    pub token_program: Program<'info, Token2022>,
} 