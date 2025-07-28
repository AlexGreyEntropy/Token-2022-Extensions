use anchor_lang::prelude::*;
use anchor_spl::token_2022;
use anchor_spl::token_interface::{Mint, Token2022, TokenAccount};
use spl_token_2022::extension::{
    mint_close_authority::MintCloseAuthority,
    transfer_fee::TransferFeeConfig,
    default_account_state::DefaultAccountState,
    immutable_owner::ImmutableOwner,
    non_transferable::NonTransferable,
    memo_transfer::RequiredMemoTransfers,
    interest_bearing_mint::InterestBearingConfig,
    permanent_delegate::PermanentDelegate,
    cpi_guard::CpiGuard,
    transfer_hook::TransferHook,
    metadata_pointer::MetadataPointer,
    group_pointer::GroupPointer,
    group_member_pointer::GroupMemberPointer,
    ExtensionType,
};

declare_id!("HYThq3CykDNuJzJVu2Xx7LVhQ2xTmAVhJgULmJwu9ZNu");

pub mod instructions;
pub mod state;
pub mod errors;

pub use instructions::*;
pub use state::*;
pub use errors::*;

#[program]
pub mod token_extensions {
    use super::*;

    pub fn create_mint_with_close_authority(
        ctx: Context<CreateMintWithCloseAuthority>,
        close_authority: Pubkey,
        decimals: u8,
    ) -> Result<()> {
        instructions::mint_close_authority::create_mint_with_close_authority(
            ctx,
            close_authority,
            decimals,
        )
    }

    pub fn close_mint(ctx: Context<CloseMint>) -> Result<()> {
        instructions::mint_close_authority::close_mint(ctx)
    }

    pub fn create_mint_with_transfer_fee(
        ctx: Context<CreateMintWithTransferFee>,
        transfer_fee_config_authority: Option<Pubkey>,
        withdraw_withheld_authority: Option<Pubkey>,
        transfer_fee_basis_points: u16,
        maximum_fee: u64,
        decimals: u8,
    ) -> Result<()> {
        instructions::transfer_fee::create_mint_with_transfer_fee(
            ctx,
            transfer_fee_config_authority,
            withdraw_withheld_authority,
            transfer_fee_basis_points,
            maximum_fee,
            decimals,
        )
    }

    pub fn transfer_with_fee(
        ctx: Context<TransferWithFee>,
        amount: u64,
        expected_fee: u64,
    ) -> Result<()> {
        instructions::transfer_fee::transfer_with_fee(ctx, amount, expected_fee)
    }

    pub fn withdraw_withheld_tokens(
        ctx: Context<WithdrawWithheldTokens>,
    ) -> Result<()> {
        instructions::transfer_fee::withdraw_withheld_tokens(ctx)
    }

    pub fn create_mint_with_default_state(
        ctx: Context<CreateMintWithDefaultState>,
        default_state: u8,
        decimals: u8,
    ) -> Result<()> {
        instructions::default_account_state::create_mint_with_default_state(
            ctx,
            default_state,
            decimals,
        )
    }
    
    // default account state extension
    pub fn update_default_account_state(
        ctx: Context<UpdateDefaultAccountState>,
        default_state: u8,
    ) -> Result<()> {
        instructions::default_account_state::update_default_account_state(ctx, default_state)
    }

    pub fn create_account_with_immutable_owner(
        ctx: Context<CreateAccountWithImmutableOwner>,
    ) -> Result<()> {
        instructions::immutable_owner::create_account_with_immutable_owner(ctx)
    }

    pub fn create_non_transferable_mint(
        ctx: Context<CreateNonTransferableMint>,
        decimals: u8,
    ) -> Result<()> {
        instructions::non_transferable::create_non_transferable_mint(ctx, decimals)
    }

    // required memo extension
    pub fn create_account_with_required_memo(
        ctx: Context<CreateAccountWithRequiredMemo>,
    ) -> Result<()> {
        instructions::required_memo::create_account_with_required_memo(ctx)
    }

    pub fn enable_required_memo_transfers(
        ctx: Context<EnableRequiredMemoTransfers>,
    ) -> Result<()> {
        instructions::required_memo::enable_required_memo_transfers(ctx)
    }

    pub fn disable_required_memo_transfers(
        ctx: Context<DisableRequiredMemoTransfers>,
    ) -> Result<()> {
        instructions::required_memo::disable_required_memo_transfers(ctx)
    }

    // interest bearing extension
    pub fn create_interest_bearing_mint(
        ctx: Context<CreateInterestBearingMint>,
        rate_authority: Option<Pubkey>,
        rate: i16,
        decimals: u8,
    ) -> Result<()> {
        instructions::interest_bearing::create_interest_bearing_mint(
            ctx,
            rate_authority,
            rate,
            decimals,
        )
    }

    pub fn update_interest_rate(
        ctx: Context<UpdateInterestRate>,
        rate: i16,
    ) -> Result<()> {
        instructions::interest_bearing::update_interest_rate(ctx, rate)
    }

    // permanent delegate extension
    pub fn create_mint_with_permanent_delegate(
        ctx: Context<CreateMintWithPermanentDelegate>,
        delegate: Pubkey,
        decimals: u8,
    ) -> Result<()> {
        instructions::permanent_delegate::create_mint_with_permanent_delegate(
            ctx,
            delegate,
            decimals,
        )
    }

    // cpi guard extension
    pub fn enable_cpi_guard(ctx: Context<EnableCpiGuard>) -> Result<()> {
        instructions::cpi_guard::enable_cpi_guard(ctx)
    }

    pub fn disable_cpi_guard(ctx: Context<DisableCpiGuard>) -> Result<()> {
        instructions::cpi_guard::disable_cpi_guard(ctx)
    }

    //transfer hook extension
    pub fn create_mint_with_transfer_hook(
        ctx: Context<CreateMintWithTransferHook>,
        authority: Option<Pubkey>,
        program_id: Option<Pubkey>,
        decimals: u8,
    ) -> Result<()> {
        instructions::transfer_hook::create_mint_with_transfer_hook(
            ctx,
            authority,
            program_id,
            decimals,
        )
    }

    pub fn update_transfer_hook_program(
        ctx: Context<UpdateTransferHookProgram>,
        program_id: Option<Pubkey>,
    ) -> Result<()> {
        instructions::transfer_hook::update_transfer_hook_program(ctx, program_id)
    }

    // metadata pointer
    pub fn create_mint_with_metadata_pointer(
        ctx: Context<CreateMintWithMetadataPointer>,
        authority: Option<Pubkey>,
        metadata_address: Option<Pubkey>,
        decimals: u8,
    ) -> Result<()> {
        instructions::metadata_pointer::create_mint_with_metadata_pointer(
            ctx,
            authority,
            metadata_address,
            decimals,
        )
    }

    // metadata extension
    pub fn create_mint_with_metadata(
        ctx: Context<CreateMintWithMetadata>,
        name: String,
        symbol: String,
        uri: String,
        decimals: u8,
    ) -> Result<()> {
        instructions::metadata::create_mint_with_metadata(ctx, name, symbol, uri, decimals)
    }

    pub fn update_metadata_field(
        ctx: Context<UpdateMetadataField>,
        field: String,
        value: String,
    ) -> Result<()> {
        instructions::metadata::update_metadata_field(ctx, field, value)
    }

    // group pointer extensionn
    pub fn create_mint_with_group_pointer(
        ctx: Context<CreateMintWithGroupPointer>,
        authority: Option<Pubkey>,
        group_address: Option<Pubkey>,
        decimals: u8,
    ) -> Result<()> {
        instructions::group_pointer::create_mint_with_group_pointer(
            ctx,
            authority,
            group_address,
            decimals,
        )
    }

    // group extension
    pub fn create_mint_with_group(
        ctx: Context<CreateMintWithGroup>,
        update_authority: Option<Pubkey>,
        max_size: u32,
        decimals: u8,
    ) -> Result<()> {
        instructions::group::create_mint_with_group(ctx, update_authority, max_size, decimals)
    }

    pub fn update_group_max_size(
        ctx: Context<UpdateGroupMaxSize>,
        max_size: u32,
    ) -> Result<()> {
        instructions::group::update_group_max_size(ctx, max_size)
    }

    // member pointer
    pub fn create_mint_with_member_pointer(
        ctx: Context<CreateMintWithMemberPointer>,
        authority: Option<Pubkey>,
        member_address: Option<Pubkey>,
        decimals: u8,
    ) -> Result<()> {
        instructions::member_pointer::create_mint_with_member_pointer(
            ctx,
            authority,
            member_address,
            decimals,
        )
    }

    // member extension
    pub fn create_mint_with_member(
        ctx: Context<CreateMintWithMember>,
        group: Pubkey,
        decimals: u8,
    ) -> Result<()> {
        instructions::member::create_mint_with_member(ctx, group, decimals)
    }

    // scaled ui amount
    pub fn create_mint_with_scaled_ui_amount(
        ctx: Context<CreateMintWithScaledUiAmount>,
        authority: Option<Pubkey>,
        multiplier: f64,
        decimals: u8,
    ) -> Result<()> {
        instructions::scaled_ui_amount::create_mint_with_scaled_ui_amount(
            ctx,
            authority,
            multiplier,
            decimals,
        )
    }

    pub fn update_ui_amount_multiplier(
        ctx: Context<UpdateUiAmountMultiplier>,
        multiplier: f64,
        effective_timestamp: Option<i64>,
    ) -> Result<()> {
        instructions::scaled_ui_amount::update_ui_amount_multiplier(
            ctx,
            multiplier,
            effective_timestamp,
        )
    }

    // pausable extension
    pub fn create_pausable_mint(
        ctx: Context<CreatePausableMint>,
        decimals: u8,
    ) -> Result<()> {
        instructions::pausable::create_pausable_mint(ctx, decimals)
    }

    pub fn pause_mint(ctx: Context<PauseMint>) -> Result<()> {
        instructions::pausable::pause_mint(ctx)
    }

    pub fn resume_mint(ctx: Context<ResumeMint>) -> Result<()> {
        instructions::pausable::resume_mint(ctx)
    }
} 