use anchor_lang::prelude::*;

#[error_code]
pub enum TokenExtensionError {
    #[msg("Invalid extension type")]
    InvalidExtensionType,
    #[msg("Extension already initialized")]
    ExtensionAlreadyInitialized,
    #[msg("Invalid authority")]
    InvalidAuthority,
    #[msg("Invalid transfer fee configuration")]
    InvalidTransferFeeConfig,
    #[msg("Transfer fee calculation error")]
    TransferFeeCalculationError,
    #[msg("Insufficient funds for transfer fee")]
    InsufficientFundsForFee,
    #[msg("Invalid default account state")]
    InvalidDefaultAccountState,
    #[msg("Account is frozen")]
    AccountFrozen,
    #[msg("Invalid interest rate")]
    InvalidInterestRate,
    #[msg("Interest rate update not allowed")]
    InterestRateUpdateNotAllowed,
    #[msg("Invalid delegate")]
    InvalidDelegate,
    #[msg("CPI guard is enabled")]
    CpiGuardEnabled,
    #[msg("Transfer hook program not found")]
    TransferHookProgramNotFound,
    #[msg("Invalid metadata")]
    InvalidMetadata,
    #[msg("Metadata field not found")]
    MetadataFieldNotFound,
    #[msg("Invalid group configuration")]
    InvalidGroupConfig,
    #[msg("Group size limit exceeded")]
    GroupSizeLimitExceeded,
    #[msg("Invalid member configuration")]
    InvalidMemberConfig,
    #[msg("Member not found in group")]
    MemberNotFoundInGroup,
    #[msg("Invalid UI amount multiplier")]
    InvalidUiAmountMultiplier,
    #[msg("Mint is paused")]
    MintPaused,
    #[msg("Invalid close authority")]
    InvalidCloseAuthority,
    #[msg("Mint supply is not zero")]
    MintSupplyNotZero,
    #[msg("Non-transferable tokens cannot be transferred")]
    NonTransferableToken,
    #[msg("Memo required for transfer")]
    MemoRequiredForTransfer,
    #[msg("Invalid memo")]
    InvalidMemo,
} 