use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022};
use anchor_spl::token_interface::Mint;
use spl_token_2022::extension::{
    group_member_pointer::GroupMemberPointer,
    ExtensionType,
};

pub fn create_mint_with_member(
    ctx: Context<CreateMintWithMember>,
    group: Pubkey,
    decimals: u8,
) -> Result<()> {
    let mint = &ctx.accounts.mint;
    let mint_authority = &ctx.accounts.mint_authority;
    let rent = &ctx.accounts.rent;
    let system_program = &ctx.accounts.system_program;
    let token_program = &ctx.accounts.token_program;
    
    // space for mint with group member pointer and token group member extensions
    let extensions = vec![ExtensionType::GroupMemberPointer, ExtensionType::TokenGroupMember];
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
    
    // group member pointer extension (pointing to the mint itself)
    let init_member_pointer_ix = spl_token_2022::instruction::initialize_group_member_pointer(
        &token_program.key(),
        &mint.key(),
        Some(&mint_authority.key()),
        Some(mint.key()),
    )?;
    
    anchor_lang::solana_program::program::invoke(
        &init_member_pointer_ix,
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
    
    // init token group member
    let init_member_ix = spl_token_group_interface::instruction::initialize_member(
        &token_program.key(),
        &mint.key(),
        &mint.key(),
        &ctx.accounts.group_mint.key(),
        &ctx.accounts.group_update_authority.key(),
    );
    
    anchor_lang::solana_program::program::invoke(
        &init_member_ix,
        &[
            mint.to_account_info(),
            ctx.accounts.group_mint.to_account_info(),
            ctx.accounts.group_update_authority.to_account_info(),
        ],
    )?;
    
    Ok(())
}

#[derive(Accounts)]
pub struct CreateMintWithMember<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]

    // account initialized by the token program
    pub mint: AccountInfo<'info>,
    pub mint_authority: Signer<'info>,
    pub group_mint: Box<InterfaceAccount<'info, Mint>>,
    pub group_update_authority: Signer<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token2022>,
} 