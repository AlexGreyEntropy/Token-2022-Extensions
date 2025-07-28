use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022};
use anchor_spl::token_interface::Mint;
use spl_token_2022::extension::{
    group_pointer::GroupPointer,
    ExtensionType,
};

pub fn create_mint_with_group(
    ctx: Context<CreateMintWithGroup>,
    update_authority: Option<Pubkey>,
    max_size: u32,
    decimals: u8,
) -> Result<()> {
    let mint = &ctx.accounts.mint;
    let mint_authority = &ctx.accounts.mint_authority;
    let rent = &ctx.accounts.rent;
    let system_program = &ctx.accounts.system_program;
    let token_program = &ctx.accounts.token_program;
    
    // space for mint with group pointer and token group extensions
    let extensions = vec![ExtensionType::GroupPointer, ExtensionType::TokenGroup];
    let space = extensions.iter().try_fold(
        spl_token_2022::state::Mint::LEN,
        |acc, &ext| ext.try_add_account_len(acc)
    )?;
    
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
    
    // group pointer extension (pointing to the mint itself)
    let init_group_pointer_ix = spl_token_2022::instruction::initialize_group_pointer(
        &token_program.key(),
        &mint.key(),
        update_authority.as_ref(),
        Some(mint.key()),
    )?;
    
    anchor_lang::solana_program::program::invoke(
        &init_group_pointer_ix,
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
    
    // init token group
    let init_group_ix = spl_token_group_interface::instruction::initialize_group(
        &token_program.key(),
        &mint.key(),
        &mint.key(),
        update_authority.as_ref(),
        max_size,
    );
    
    anchor_lang::solana_program::program::invoke(
        &init_group_ix,
        &[
            mint.to_account_info(),
        ],
    )?;
    
    Ok(())
}

pub fn update_group_max_size(ctx: Context<UpdateGroupMaxSize>, max_size: u32) -> Result<()> {
    let update_group_ix = spl_token_group_interface::instruction::update_group_max_size(
        &ctx.accounts.token_program.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.update_authority.key(),
        max_size,
    );
    
    anchor_lang::solana_program::program::invoke_signed(
        &update_group_ix,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.update_authority.to_account_info(),
        ],
        &[],
    )?;
    
    Ok(())
}

#[derive(Accounts)]
pub struct CreateMintWithGroup<'info> {
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
pub struct UpdateGroupMaxSize<'info> {
    #[account(mut)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub update_authority: Signer<'info>,
    pub token_program: Program<'info, Token2022>,
} 