use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022};
use anchor_spl::token_interface::{Mint, TokenAccount};
use spl_token_2022::extension::{
    memo_transfer::RequiredMemoTransfers,
    ExtensionType,
};

pub fn create_account_with_required_memo(
    ctx: Context<CreateAccountWithRequiredMemo>,
) -> Result<()> {
    let token_account = &ctx.accounts.token_account;
    let mint = &ctx.accounts.mint;
    let owner = &ctx.accounts.owner;
    let rent = &ctx.accounts.rent;
    let system_program = &ctx.accounts.system_program;
    let token_program = &ctx.accounts.token_program;
    
    // space for token account with required memo transfers extension
    let space = ExtensionType::MemoTransfer.try_calculate_account_len::<spl_token_2022::state::Account>(&[])?;
    
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
    
    // init required memo transfers extension
    let init_memo_transfer_ix = spl_token_2022::instruction::initialize_account_with_memo_transfer(
        &token_program.key(),
        &token_account.key(),
        &mint.key(),
        &owner.key(),
        false,
        //use true, for outgoing transfer memos
    )?;
    
    anchor_lang::solana_program::program::invoke(
        &init_memo_transfer_ix,
        &[
            token_account.to_account_info(),
            mint.to_account_info(),
            owner.to_account_info(),
            rent.to_account_info(),
        ],
    )?;
    
    Ok(())
}

pub fn enable_required_memo_transfers(ctx: Context<EnableRequiredMemoTransfers>) -> Result<()> {
    let enable_memo_ix = spl_token_2022::instruction::enable_required_transfer_memos(
        &ctx.accounts.token_program.key(),
        &ctx.accounts.token_account.key(),
        &ctx.accounts.owner.key(),
        &[],
    )?;
    
    anchor_lang::solana_program::program::invoke_signed(
        &enable_memo_ix,
        &[
            ctx.accounts.token_account.to_account_info(),
            ctx.accounts.owner.to_account_info(),
        ],
        &[],
    )?;
    
    Ok(())
}

pub fn disable_required_memo_transfers(ctx: Context<DisableRequiredMemoTransfers>) -> Result<()> {
    let disable_memo_ix = spl_token_2022::instruction::disable_required_transfer_memos(
        &ctx.accounts.token_program.key(),
        &ctx.accounts.token_account.key(),
        &ctx.accounts.owner.key(),
        &[],
    )?;
    
    anchor_lang::solana_program::program::invoke_signed(
        &disable_memo_ix,
        &[
            ctx.accounts.token_account.to_account_info(),
            ctx.accounts.owner.to_account_info(),
        ],
        &[],
    )?;
    
    Ok(())
}

#[derive(Accounts)]
pub struct CreateAccountWithRequiredMemo<'info> {
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

#[derive(Accounts)]
pub struct EnableRequiredMemoTransfers<'info> {
    #[account(mut)]
    pub token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct DisableRequiredMemoTransfers<'info> {
    #[account(mut)]
    pub token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token2022>,
} 