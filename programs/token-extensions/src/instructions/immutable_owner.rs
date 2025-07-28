use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022};
use anchor_spl::token_interface::{Mint, TokenAccount};
use spl_token_2022::extension::{
    immutable_owner::ImmutableOwner,
    ExtensionType,
};

pub fn create_account_with_immutable_owner(
    ctx: Context<CreateAccountWithImmutableOwner>,
) -> Result<()> {
    let token_account = &ctx.accounts.token_account;
    let mint = &ctx.accounts.mint;
    let owner = &ctx.accounts.owner;
    let rent = &ctx.accounts.rent;
    let system_program = &ctx.accounts.system_program;
    let token_program = &ctx.accounts.token_program;
    
    // space for token account with immutable owner extension
    let space = ExtensionType::ImmutableOwner.try_calculate_account_len::<spl_token_2022::state::Account>(&[])?;
    
    // token account
    let create_account_ix = anchor_lang::solana_program::system_instruction::create_account(
        &ctx.accounts.payer.key(),
        &token_account.key(),
        rent.minimum_balance(space),
        space as u64,
        &token_program.key(),
    );
    
    anchor_lang::solana_program::program::invoke(
        &create_account_ix,
        &[
            ctx.accounts.payer.to_account_info(),
            token_account.to_account_info(),
            system_program.to_account_info(),
        ],
    )?;
    
    // init immutable owner extension
    let init_immutable_owner_ix = spl_token_2022::instruction::initialize_immutable_owner(
        &token_program.key(),
        &token_account.key(),
    )?;
    
    anchor_lang::solana_program::program::invoke(
        &init_immutable_owner_ix,
        &[
            token_account.to_account_info(),
        ],
    )?;
    
    // init token account
    let init_account_ix = spl_token_2022::instruction::initialize_account3(
        &token_program.key(),
        &token_account.key(),
        &mint.key(),
        &owner.key(),
    )?;
    
    anchor_lang::solana_program::program::invoke(
        &init_account_ix,
        &[
            token_account.to_account_info(),
            mint.to_account_info(),
            owner.to_account_info(),
            rent.to_account_info(),
        ],
    )?;
    
    Ok(())
}

#[derive(Accounts)]
pub struct CreateAccountWithImmutableOwner<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]

    // account initialized by the token program
    pub token_account: AccountInfo<'info>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    
    // account that will own the token account
    pub owner: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token2022>,
} 