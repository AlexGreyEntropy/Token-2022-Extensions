use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022};
use anchor_spl::token_interface::Mint;
use spl_token_2022::extension::{
    metadata_pointer::MetadataPointer,
    ExtensionType,
};

pub fn create_mint_with_metadata(
    ctx: Context<CreateMintWithMetadata>,
    name: String,
    symbol: String,
    uri: String,
    decimals: u8,
) -> Result<()> {
    let mint = &ctx.accounts.mint;
    let mint_authority = &ctx.accounts.mint_authority;
    let rent = &ctx.accounts.rent;
    let system_program = &ctx.accounts.system_program;
    let token_program = &ctx.accounts.token_program;
    
    // space for mint with metadata pointer and token metadata extensions
    let extensions = vec![ExtensionType::MetadataPointer, ExtensionType::TokenMetadata];
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
    
    // init metadata pointer extension (pointing to the mint itself)
    let init_metadata_pointer_ix = spl_token_2022::instruction::initialize_metadata_pointer(
        &token_program.key(),
        &mint.key(),
        Some(&mint_authority.key()),
        Some(mint.key()),
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
    
    //init token metadata
    let init_metadata_ix = spl_token_metadata_interface::instruction::initialize(
        &token_program.key(),
        &mint.key(),
        &mint_authority.key(),
        &mint.key(),
        &mint_authority.key(),
        name,
        symbol,
        uri,
    );
    
    anchor_lang::solana_program::program::invoke(
        &init_metadata_ix,
        &[
            mint.to_account_info(),
            mint_authority.to_account_info(),
        ],
    )?;
    
    Ok(())
}

pub fn update_metadata_field(
    ctx: Context<UpdateMetadataField>,
    field: String,
    value: String,
) -> Result<()> {
    let update_field_ix = spl_token_metadata_interface::instruction::update_field(
        &ctx.accounts.token_program.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.update_authority.key(),
        spl_token_metadata_interface::state::Field::Key(field),
        value,
    );
    
    anchor_lang::solana_program::program::invoke_signed(
        &update_field_ix,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.update_authority.to_account_info(),
        ],
        &[],
    )?;
    
    Ok(())
}

#[derive(Accounts)]
pub struct CreateMintWithMetadata<'info> {
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
pub struct UpdateMetadataField<'info> {
    #[account(mut)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub update_authority: Signer<'info>,
    pub token_program: Program<'info, Token2022>,
} 