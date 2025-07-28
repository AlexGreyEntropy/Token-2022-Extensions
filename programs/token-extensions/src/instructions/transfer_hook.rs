use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022};
use anchor_spl::token_interface::Mint;
use spl_token_2022::extension::{
    transfer_hook::TransferHook,
    ExtensionType,
};

pub fn create_mint_with_transfer_hook(
    ctx: Context<CreateMintWithTransferHook>,
    authority: Option<Pubkey>,
    program_id: Option<Pubkey>,
    decimals: u8,
) -> Result<()> {
    let mint = &ctx.accounts.mint;
    let mint_authority = &ctx.accounts.mint_authority;
    let rent = &ctx.accounts.rent;
    let system_program = &ctx.accounts.system_program;
    let token_program = &ctx.accounts.token_program;
    
    // space for mint with transfer hook extension
    let space = ExtensionType::TransferHook.try_calculate_account_len::<spl_token_2022::state::Mint>(&[])?;
    
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
    
    // init transfer hook extension
    let init_transfer_hook_ix = spl_token_2022::instruction::initialize_transfer_hook(
        &token_program.key(),
        &mint.key(),
        authority.as_ref(),
        program_id,
    )?;
    
    anchor_lang::solana_program::program::invoke(
        &init_transfer_hook_ix,
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

pub fn update_transfer_hook_program(
    ctx: Context<UpdateTransferHookProgram>,
    program_id: Option<Pubkey>,
) -> Result<()> {
    let update_transfer_hook_ix = spl_token_2022::instruction::update_transfer_hook(
        &ctx.accounts.token_program.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.authority.key(),
        &[],
        program_id,
    )?;
    
    anchor_lang::solana_program::program::invoke_signed(
        &update_transfer_hook_ix,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.authority.to_account_info(),
        ],
        &[],
    )?;
    
    Ok(())
}

#[derive(Accounts)]
pub struct CreateMintWithTransferHook<'info> {
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
pub struct UpdateTransferHookProgram<'info> {
    #[account(mut)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token2022>,
} 