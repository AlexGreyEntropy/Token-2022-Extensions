use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct TokenExtensionMint {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub extension_types: Vec<u8>,
    pub created_at: i64,
}

impl TokenExtensionMint {

    // size for Token-2022 mint structure
    // structure: discriminator(8) + mint(32) + authority(32) + extension_types_vec(4+10) + created_at(8)
    pub const SIZE: usize = 8 + 32 + 32 + 4 + 10 + 8;
}

#[account]
#[derive(Default)]
pub struct MetadataAccount {
    pub mint: Pubkey,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub update_authority: Pubkey,
    pub additional_metadata: Vec<(String, String)>,
}

impl MetadataAccount {

    // this is the max size for the metadata account based on Token-2022 specification
    // structure: discriminator(8) + mint(32) + update_authority(32) + key(1) + primary_sale_happened(1) + is_mutable(1) + edition_nonce(1) + data fields
pub const MAX_SIZE: usize = 8 + 32 + 32 + 1 + 1 + 1 + 1 + (4 + 32) + (4 + 10) + (4 + 200) + 2 + (4 + 10 * (4 + 32 + 4 + 100));}

#[account]
#[derive(Default)]
pub struct GroupAccount {
    pub mint: Pubkey,
    pub update_authority: Option<Pubkey>,
    pub size: u32,
    pub max_size: u32,
}

impl GroupAccount {
    pub const SIZE: usize = 8 + 32 + (1 + 32) + 4 + 4;
}

#[account]
#[derive(Default)]
pub struct MemberAccount {
    pub mint: Pubkey,
    pub group: Pubkey,
    pub member_number: u32,
}

impl MemberAccount {
    pub const SIZE: usize = 8 + 32 + 32 + 4;
} 