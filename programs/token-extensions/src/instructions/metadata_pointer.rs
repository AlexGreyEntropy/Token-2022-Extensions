use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022};
use anchor_spl::token_interface::Mint;
use spl_token_2022::extension::{
    metadata_pointer::MetadataPointer,
    ExtensionType,
};

pub fn create_mint_with_metadata_pointer(
    ctx: Context<CreateMintWithMetadataPointer>,
    authority: Option<Pubkey>,
    metadata_address: Option<Pubkey>,
    decimals: u8,
) -> Result<()> {
    let mint = &ctx.accounts.mint;
    let mint_authority = &ctx.accounts.mint_authority;
    let rent = &ctx.accounts.rent;
    let system_program = &ctx.accounts.system_program;
    let token_program = &ctx.accounts.token_program;
    
    // space for mint with metadata pointer extension
    let space = ExtensionType::MetadataPointer.try_calculate_account_len::<spl_token_2022::state::Mint>(&[])?;
    
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
    
    // init metadata pointer extension
    let init_metadata_pointer_ix = spl_token_2022::instruction::initialize_metadata_pointer(
        &token_program.key(),
        &mint.key(),
        authority.as_ref(),
        metadata_address,
    )?;
    
    anchor_lang::solana_program::program::invoke(
        &init_metadata_pointer_ix,
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

#[derive(Accounts)]
pub struct CreateMintWithMetadataPointer<'info> {
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