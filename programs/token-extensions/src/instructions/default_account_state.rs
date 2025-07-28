use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022};
use anchor_spl::token_interface::Mint;
use spl_token_2022::extension::{
    default_account_state::DefaultAccountState,
    ExtensionType,
};

pub fn create_mint_with_default_state(
    ctx: Context<CreateMintWithDefaultState>,
    default_state: u8,
    decimals: u8,
) -> Result<()> {
    let mint = &ctx.accounts.mint;
    let mint_authority = &ctx.accounts.mint_authority;
    let rent = &ctx.accounts.rent;
    let system_program = &ctx.accounts.system_program;
    let token_program = &ctx.accounts.token_program;
    
    // space for mint with the default account state extension
    let space = ExtensionType::DefaultAccountState.try_calculate_account_len::<spl_token_2022::state::Mint>(&[])?;
    
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
    
    // init default account state extension
    let account_state = match default_state {
        0 => spl_token_2022::state::AccountState::Uninitialized,
        1 => spl_token_2022::state::AccountState::Initialized,
        2 => spl_token_2022::state::AccountState::Frozen,
        _ => return Err(crate::errors::TokenExtensionError::InvalidDefaultAccountState.into()),
    };
    
    let init_default_state_ix = spl_token_2022::instruction::initialize_default_account_state(
        &token_program.key(),
        &mint.key(),
        &account_state,
    )?;
    
    anchor_lang::solana_program::program::invoke(
        &init_default_state_ix,
        &[
            mint.to_account_info(),
        ],
    )?;
    
    // mint
    let init_mint_ix = spl_token_2022::instruction::initialize_mint2(
        &token_program.key(),
        &mint.key(),
        &mint_authority.key(),
        Some(&mint_authority.key()),
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

pub fn update_default_account_state(
    ctx: Context<UpdateDefaultAccountState>,
    default_state: u8,
) -> Result<()> {
    let account_state = match default_state {
        0 => spl_token_2022::state::AccountState::Uninitialized,
        1 => spl_token_2022::state::AccountState::Initialized,
        2 => spl_token_2022::state::AccountState::Frozen,
        _ => return Err(crate::errors::TokenExtensionError::InvalidDefaultAccountState.into()),
    };
    
    let update_default_state_ix = spl_token_2022::instruction::update_default_account_state(
        &ctx.accounts.token_program.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.freeze_authority.key(),
        &[],
        &account_state,
    )?;
    
    anchor_lang::solana_program::program::invoke_signed(
        &update_default_state_ix,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.freeze_authority.to_account_info(),
        ],
        &[],
    )?;
    
    Ok(())
}

#[derive(Accounts)]
pub struct CreateMintWithDefaultState<'info> {
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
pub struct UpdateDefaultAccountState<'info> {
    #[account(mut)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub freeze_authority: Signer<'info>,
    pub token_program: Program<'info, Token2022>,
} 