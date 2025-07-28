#!/usr/bin/env node

const { Command } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const { Connection, Keypair, SystemProgram, Transaction, sendAndConfirmTransaction, PublicKey } = require('@solana/web3.js');
const {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
  createInitializeInterestBearingMintInstruction,
  createInitializeNonTransferableMintInstruction,
  createInitializeMintCloseAuthorityInstruction,
  createInitializeDefaultAccountStateInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeGroupPointerInstruction,
  createInitializeMemberPointerInstruction,
  createInitializeTransferHookInstruction,
  getMintLen,
  getAccountLen,
  ExtensionType,
  createAccount,
  mintTo,
  getMint,
  getAccount,
  AccountState
} = require('@solana/spl-token');

// Import token metadata interface functions
const { createInitializeInstruction: createInitializeMetadataInstruction } = (() => {
  try {
    return require('@solana/spl-token-metadata');
  } catch (error) {
    console.log(chalk.yellow('Note: @solana/spl-token-metadata not available, metadata features limited'));
    return { createInitializeInstruction: null };
  }
})();

const program = new Command();

const DEFAULT_CONFIG = {
  network: 'devnet',
  rpcUrl: 'https://api.devnet.solana.com',
  walletPath: './wallet.json',
  outputDir: './tokens',
  defaultDecimals: 6,
  defaultFeeBasisPoints: 100,
  defaultMaxFee: 1000000,
  defaultInterestRate: 500,
  defaultAmount: 1000,
  confirmTransactions: true,
  saveTokenInfo: true,
  showDetailedOutput: true
};

// Validation functions
function validatePublicKey(input) {
  try {
    new PublicKey(input);
    return true;
  } catch {
    return false;
  }
}

function validateDecimals(input) {
  const num = parseInt(input);
  return num >= 0 && num <= 9;
}

function validateFeeBasisPoints(input) {
  const num = parseInt(input);
  return num >= 0 && num <= 10000;
}

function validateInterestRate(input) {
  const num = parseInt(input);
  return num >= -10000 && num <= 10000;
}

function validateAmount(input) {
  const num = parseFloat(input);
  return num > 0;
}

function validateNetwork(input) {
  return ['devnet', 'testnet', 'mainnet-beta', 'localnet'].includes(input);
}

// Enhanced configuration management
function loadConfig() {
  const configPath = path.join(process.cwd(), 'token-cli.config.json');
  if (fs.existsSync(configPath)) {
    try {
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return { ...DEFAULT_CONFIG, ...savedConfig };
    } catch (error) {
      console.log(chalk.yellow('Warning: Invalid config file, using defaults'));
      return DEFAULT_CONFIG;
    }
  }
  return DEFAULT_CONFIG;
}

function saveConfig(config) {
  const configPath = path.join(process.cwd(), 'token-cli.config.json');
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error(chalk.red('Error saving config:'), error.message);
    return false;
  }
}

function loadWallet(walletPath) {
  try {
    if (!fs.existsSync(walletPath)) {
      throw new Error(`Wallet file not found: ${walletPath}`);
    }
    
    const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
    
    // Handle different wallet formats
    let secretKey;
    if (Array.isArray(walletData)) {
      secretKey = new Uint8Array(walletData);
    } else if (walletData.secretKey) {
      secretKey = new Uint8Array(walletData.secretKey);
    } else {
      throw new Error('Invalid wallet format');
    }
    
    return Keypair.fromSecretKey(secretKey);
  } catch (error) {
    console.error(chalk.red(`Error loading wallet from ${walletPath}:`), error.message);
    console.error(chalk.yellow('Create a wallet with: solana-keygen new --outfile wallet.json'));
    console.error(chalk.yellow('Or configure a different wallet path with: token-extensions-cli config --wallet-path <path>'));
    process.exit(1);
  }
}

function ensureOutputDir(dir) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (error) {
      console.error(chalk.red('Error creating output directory:'), error.message);
      process.exit(1);
    }
  }
}

function saveTokenInfo(tokenInfo, outputDir) {
  if (!tokenInfo) return null;
  
  try {
    ensureOutputDir(outputDir);
    const filename = `${tokenInfo.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.json`;
    const filepath = path.join(outputDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(tokenInfo, null, 2));
    return filepath;
  } catch (error) {
    console.error(chalk.yellow('Warning: Could not save token info:'), error.message);
    return null;
  }
}

async function getConnection(rpcUrl) {
  const connection = new Connection(rpcUrl, 'confirmed');
  try {
    await connection.getVersion();
    return connection;
  } catch (error) {
    console.error(chalk.red(`Failed to connect to ${rpcUrl}`));
    console.error(chalk.yellow('Check your internet connection and RPC URL'));
    process.exit(1);
  }
}

// Enhanced token creation with better error handling and validation
async function createTransferFeeToken(options, config) {
  console.log(chalk.blue('Creating Transfer Fee Token...'));
  
  try {
    const connection = await getConnection(config.rpcUrl);
    const wallet = loadWallet(config.walletPath);
    const mint = Keypair.generate();
    const mintAuthority = Keypair.generate();
    
    // Validate and set defaults
    const feeBasisPoints = parseInt(options.feeBasisPoints) || config.defaultFeeBasisPoints;
    // Convert whole tokens to smallest units (1 token = 10^decimals smallest units)
    const maxFeeTokens = parseInt(options.maxFee) || 1;
    const maxFee = BigInt(maxFeeTokens * Math.pow(10, decimals));
    const decimals = parseInt(options.decimals) || config.defaultDecimals;
    
    if (!validateFeeBasisPoints(feeBasisPoints)) {
      throw new Error('Fee basis points must be between 0 and 10000');
    }
    
    if (!validateDecimals(decimals)) {
      throw new Error('Decimals must be between 0 and 9');
    }
    
    const transferFeeAuthority = options.feeAuthority ? 
      (validatePublicKey(options.feeAuthority) ? new PublicKey(options.feeAuthority) : Keypair.generate().publicKey) :
      Keypair.generate().publicKey;
      
    const withdrawAuthority = options.withdrawAuthority ? 
      (validatePublicKey(options.withdrawAuthority) ? new PublicKey(options.withdrawAuthority) : Keypair.generate().publicKey) :
      Keypair.generate().publicKey;
    
    const extensions = [ExtensionType.TransferFeeConfig];
    const mintLen = getMintLen(extensions);
    const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);

    const transaction = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: wallet.publicKey,
        newAccountPubkey: mint.publicKey,
        space: mintLen,
        lamports: mintLamports,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeTransferFeeConfigInstruction(
        mint.publicKey,
        transferFeeAuthority,
        withdrawAuthority,
        feeBasisPoints,
        maxFee,
        TOKEN_2022_PROGRAM_ID
      ),
      createInitializeMintInstruction(
        mint.publicKey,
        decimals,
        mintAuthority.publicKey,
        null,
        TOKEN_2022_PROGRAM_ID
      )
    );

    console.log(chalk.gray('Sending transaction...'));
    await sendAndConfirmTransaction(connection, transaction, [wallet, mint]);
    
    let tokenAccount = null;
    if (options.mint) {
      console.log(chalk.gray('Creating token account...'));
      tokenAccount = await createAccount(
        connection,
        wallet,
        mint.publicKey,
        wallet.publicKey,
        undefined,
        { commitment: "confirmed" },
        TOKEN_2022_PROGRAM_ID
      );

      const mintAmount = BigInt((options.amount || config.defaultAmount) * Math.pow(10, decimals));
      console.log(chalk.gray('Minting tokens...'));
      await mintTo(
        connection,
        wallet,
        mint.publicKey,
        tokenAccount,
        mintAuthority,
        mintAmount,
        [],
        { commitment: "confirmed" },
        TOKEN_2022_PROGRAM_ID
      );
    }

    const tokenInfo = {
      name: options.name || 'Transfer Fee Token',
      type: 'transfer-fee',
      mint: mint.publicKey.toBase58(),
      mintAuthority: mintAuthority.publicKey.toBase58(),
      transferFeeAuthority: transferFeeAuthority.toBase58(),
      withdrawAuthority: withdrawAuthority.toBase58(),
      decimals,
      feeBasisPoints,
      maxFee: maxFee.toString(),
      tokenAccount: tokenAccount?.toBase58(),
      amount: options.amount || config.defaultAmount,
      network: config.network,
      createdAt: new Date().toISOString()
    };

    const savedPath = config.saveTokenInfo ? saveTokenInfo(tokenInfo, config.outputDir) : null;
    
    console.log(chalk.green('Transfer Fee Token Created Successfully'));
    console.log(chalk.cyan(`Mint: ${tokenInfo.mint}`));
    console.log(chalk.cyan(`Fee: ${feeBasisPoints / 100}% (max: ${maxFeeTokens} tokens)`));
    console.log(chalk.cyan(`Decimals: ${decimals}`));
    if (tokenAccount) {
      console.log(chalk.cyan(`Token Account: ${tokenAccount.toBase58()}`));
      console.log(chalk.cyan(`Amount: ${options.amount || config.defaultAmount} tokens`));
    }
    if (savedPath) {
      console.log(chalk.gray(`Saved to: ${savedPath}`));
    }
    
    return tokenInfo;
  } catch (error) {
    console.error(chalk.red('Error creating transfer fee token:'), error.message);
    throw error;
  }
}

async function createInterestBearingToken(options, config) {
  console.log(chalk.blue('Creating Interest-Bearing Token...'));
  
  const connection = await getConnection(config.rpcUrl);
  const wallet = loadWallet(config.walletPath);
  const mint = Keypair.generate();
  const mintAuthority = Keypair.generate();
  const rateAuthority = options.rateAuthority ? new PublicKey(options.rateAuthority) : Keypair.generate().publicKey;
  
  // 1% = 100 basis points
  const ratePercentage = parseInt(options.rate) || 5;
  const rate = ratePercentage * 100;
  const decimals = parseInt(options.decimals) || config.defaultDecimals;
  
  const extensions = [ExtensionType.InterestBearingConfig];
  const mintLen = getMintLen(extensions);
  const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeInterestBearingMintInstruction(
      mint.publicKey,
      rateAuthority,
      rate,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mint.publicKey,
      decimals,
      mintAuthority.publicKey,
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await sendAndConfirmTransaction(connection, transaction, [wallet, mint]);
  
  let tokenAccount = null;
  if (options.mint) {
    tokenAccount = await createAccount(
      connection,
      wallet,
      mint.publicKey,
      wallet.publicKey,
      undefined,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );

    const mintAmount = BigInt((options.amount || 1000) * Math.pow(10, decimals));
    await mintTo(
      connection,
      wallet,
      mint.publicKey,
      tokenAccount,
      mintAuthority,
      mintAmount,
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
  }

  const tokenInfo = {
    name: options.name || 'Interest-Bearing Token',
    type: 'interest-bearing',
    mint: mint.publicKey.toBase58(),
    mintAuthority: mintAuthority.publicKey.toBase58(),
    rateAuthority: rateAuthority.toBase58(),
    decimals,
    interestRate: rate,
    tokenAccount: tokenAccount?.toBase58(),
    amount: options.amount,
    network: config.network,
    createdAt: new Date().toISOString()
  };

  const savedPath = saveTokenInfo(tokenInfo, config.outputDir);
  
  console.log(chalk.green('Interest-Bearing Token Created Successfully'));
  console.log(chalk.cyan(`Mint: ${tokenInfo.mint}`));
  console.log(chalk.cyan(`Interest Rate: ${ratePercentage}% annually`));
  if (tokenAccount) {
    console.log(chalk.cyan(`Token Account: ${tokenAccount.toBase58()}`));
    console.log(chalk.cyan(`Amount: ${options.amount} tokens`));
  }
  console.log(chalk.gray(`Saved to: ${savedPath}`));
  
  return tokenInfo;
}

async function createSoulboundToken(options, config) {
  console.log(chalk.blue('Creating Soulbound Token...'));
  
  const connection = await getConnection(config.rpcUrl);
  const wallet = loadWallet(config.walletPath);
  const mint = Keypair.generate();
  const mintAuthority = Keypair.generate();
  
  const decimals = parseInt(options.decimals) || 0;
  
  const extensions = [ExtensionType.NonTransferable];
  const mintLen = getMintLen(extensions);
  const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeNonTransferableMintInstruction(
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mint.publicKey,
      decimals,
      mintAuthority.publicKey,
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await sendAndConfirmTransaction(connection, transaction, [wallet, mint]);
  
  let tokenAccount = null;
  if (options.mint) {
    tokenAccount = await createAccount(
      connection,
      wallet,
      mint.publicKey,
      wallet.publicKey,
      undefined,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );

    const mintAmount = BigInt((options.amount || 1) * Math.pow(10, decimals));
    await mintTo(
      connection,
      wallet,
      mint.publicKey,
      tokenAccount,
      mintAuthority,
      mintAmount,
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
  }

  const tokenInfo = {
    name: options.name || 'Soulbound Token',
    type: 'soulbound',
    mint: mint.publicKey.toBase58(),
    mintAuthority: mintAuthority.publicKey.toBase58(),
    decimals,
    nonTransferable: true,
    tokenAccount: tokenAccount?.toBase58(),
    amount: options.amount,
    network: config.network,
    createdAt: new Date().toISOString()
  };

  const savedPath = saveTokenInfo(tokenInfo, config.outputDir);
  
  console.log(chalk.green('Soulbound Token Created Successfully'));
  console.log(chalk.cyan(`Mint: ${tokenInfo.mint}`));
  console.log(chalk.cyan(`Non-Transferable: Yes`));
  if (tokenAccount) {
    console.log(chalk.cyan(`Token Account: ${tokenAccount.toBase58()}`));
    console.log(chalk.cyan(`Amount: ${options.amount} tokens`));
  }
  console.log(chalk.gray(`Saved to: ${savedPath}`));
  
  return tokenInfo;
}

async function createCloseableToken(options, config) {
  console.log(chalk.blue('Creating Closeable Token...'));
  
  const connection = await getConnection(config.rpcUrl);
  const wallet = loadWallet(config.walletPath);
  const mint = Keypair.generate();
  const mintAuthority = Keypair.generate();
  const closeAuthority = options.closeAuthority ? new PublicKey(options.closeAuthority) : Keypair.generate().publicKey;
  
  const decimals = parseInt(options.decimals) || config.defaultDecimals;
  
  const extensions = [ExtensionType.MintCloseAuthority];
  const mintLen = getMintLen(extensions);
  const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMintCloseAuthorityInstruction(
      mint.publicKey,
      closeAuthority,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mint.publicKey,
      decimals,
      mintAuthority.publicKey,
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await sendAndConfirmTransaction(connection, transaction, [wallet, mint]);
  
  let tokenAccount = null;
  if (options.mint) {
    tokenAccount = await createAccount(
      connection,
      wallet,
      mint.publicKey,
      wallet.publicKey,
      undefined,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );

    const mintAmount = BigInt((options.amount || 1000) * Math.pow(10, decimals));
    await mintTo(
      connection,
      wallet,
      mint.publicKey,
      tokenAccount,
      mintAuthority,
      mintAmount,
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
  }

  const tokenInfo = {
    name: options.name || 'Closeable Token',
    type: 'closeable',
    mint: mint.publicKey.toBase58(),
    mintAuthority: mintAuthority.publicKey.toBase58(),
    closeAuthority: closeAuthority.toBase58(),
    decimals,
    tokenAccount: tokenAccount?.toBase58(),
    amount: options.amount,
    network: config.network,
    createdAt: new Date().toISOString()
  };

  const savedPath = saveTokenInfo(tokenInfo, config.outputDir);
  
  console.log(chalk.green('Closeable Token Created Successfully'));
  console.log(chalk.cyan(`Mint: ${tokenInfo.mint}`));
  console.log(chalk.cyan(`Close Authority: ${tokenInfo.closeAuthority}`));
  if (tokenAccount) {
    console.log(chalk.cyan(`Token Account: ${tokenAccount.toBase58()}`));
    console.log(chalk.cyan(`Amount: ${options.amount} tokens`));
  }
  console.log(chalk.gray(`Saved to: ${savedPath}`));
  
  return tokenInfo;
}

async function createFrozenDefaultToken(options, config) {
  console.log(chalk.blue('Creating Frozen Default Token...'));
  
  const connection = await getConnection(config.rpcUrl);
  const wallet = loadWallet(config.walletPath);
  const mint = Keypair.generate();
  const mintAuthority = Keypair.generate();
  
  const decimals = parseInt(options.decimals) || config.defaultDecimals;
  
  const extensions = [ExtensionType.ImmutableOwner];
  const mintLen = getMintLen(extensions);
  const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeImmutableOwnerInstruction(
      mint.publicKey,
      wallet.publicKey,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mint.publicKey,
      decimals,
      mintAuthority.publicKey,
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await sendAndConfirmTransaction(connection, transaction, [wallet, mint]);
  
  let tokenAccount = null;
  if (options.mint) {
    tokenAccount = await createAccount(
      connection,
      wallet,
      mint.publicKey,
      wallet.publicKey,
      undefined,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );

    const mintAmount = BigInt((options.amount || 1000) * Math.pow(10, decimals));
    await mintTo(
      connection,
      wallet,
      mint.publicKey,
      tokenAccount,
      mintAuthority,
      mintAmount,
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
  }

  const tokenInfo = {
    name: options.name || 'Frozen Default Token',
    type: 'frozen',
    mint: mint.publicKey.toBase58(),
    mintAuthority: mintAuthority.publicKey.toBase58(),
    decimals,
    immutableOwner: wallet.publicKey.toBase58(),
    tokenAccount: tokenAccount?.toBase58(),
    amount: options.amount,
    network: config.network,
    createdAt: new Date().toISOString()
  };

  const savedPath = saveTokenInfo(tokenInfo, config.outputDir);
  
  console.log(chalk.green('Frozen Default Token Created Successfully'));
  console.log(chalk.cyan(`Mint: ${tokenInfo.mint}`));
  console.log(chalk.cyan(`Immutable Owner: ${tokenInfo.immutableOwner}`));
  if (tokenAccount) {
    console.log(chalk.cyan(`Token Account: ${tokenAccount.toBase58()}`));
    console.log(chalk.cyan(`Amount: ${options.amount} tokens`));
  }
  console.log(chalk.gray(`Saved to: ${savedPath}`));
  
  return tokenInfo;
}

async function createRequiredMemoTransfersToken(options, config) {
  console.log(chalk.blue('Creating Required Memo Transfers Token...'));
  
  const connection = await getConnection(config.rpcUrl);
  const wallet = loadWallet(config.walletPath);
  const mint = Keypair.generate();
  const mintAuthority = Keypair.generate();
  const memoAuthority = options.memoAuthority ? new PublicKey(options.memoAuthority) : Keypair.generate().publicKey;
  
  const decimals = parseInt(options.decimals) || config.defaultDecimals;
  
  const extensions = [ExtensionType.RequiredMemoTransfers];
  const mintLen = getMintLen(extensions);
  const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeRequiredMemoTransfersInstruction(
      mint.publicKey,
      memoAuthority,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mint.publicKey,
      decimals,
      mintAuthority.publicKey,
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await sendAndConfirmTransaction(connection, transaction, [wallet, mint]);
  
  let tokenAccount = null;
  if (options.mint) {
    tokenAccount = await createAccount(
      connection,
      wallet,
      mint.publicKey,
      wallet.publicKey,
      undefined,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );

    const mintAmount = BigInt((options.amount || 1000) * Math.pow(10, decimals));
    await mintTo(
      connection,
      wallet,
      mint.publicKey,
      tokenAccount,
      mintAuthority,
      mintAmount,
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
  }

  const tokenInfo = {
    name: options.name || 'Required Memo Transfers Token',
    type: 'required-memo-transfers',
    mint: mint.publicKey.toBase58(),
    mintAuthority: mintAuthority.publicKey.toBase58(),
    memoAuthority: memoAuthority.toBase58(),
    decimals,
    tokenAccount: tokenAccount?.toBase58(),
    amount: options.amount,
    network: config.network,
    createdAt: new Date().toISOString()
  };

  const savedPath = saveTokenInfo(tokenInfo, config.outputDir);
  
  console.log(chalk.green('Required Memo Transfers Token Created Successfully'));
  console.log(chalk.cyan(`Mint: ${tokenInfo.mint}`));
  console.log(chalk.cyan(`Memo Authority: ${tokenInfo.memoAuthority}`));
  if (tokenAccount) {
    console.log(chalk.cyan(`Token Account: ${tokenAccount.toBase58()}`));
    console.log(chalk.cyan(`Amount: ${options.amount} tokens`));
  }
  console.log(chalk.gray(`Saved to: ${savedPath}`));
  
  return tokenInfo;
}

async function createCpiGuardToken(options, config) {
  console.log(chalk.blue('Creating CPI Guard Token...'));
  
  const connection = await getConnection(config.rpcUrl);
  const wallet = loadWallet(config.walletPath);
  const mint = Keypair.generate();
  const mintAuthority = Keypair.generate();
  const cpiGuardAuthority = options.cpiGuardAuthority ? new PublicKey(options.cpiGuardAuthority) : Keypair.generate().publicKey;
  
  const decimals = parseInt(options.decimals) || config.defaultDecimals;
  
  const extensions = [ExtensionType.CpiGuard];
  const mintLen = getMintLen(extensions);
  const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeCpiGuardInstruction(
      mint.publicKey,
      cpiGuardAuthority,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mint.publicKey,
      decimals,
      mintAuthority.publicKey,
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await sendAndConfirmTransaction(connection, transaction, [wallet, mint]);
  
  let tokenAccount = null;
  if (options.mint) {
    tokenAccount = await createAccount(
      connection,
      wallet,
      mint.publicKey,
      wallet.publicKey,
      undefined,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );

    const mintAmount = BigInt((options.amount || 1000) * Math.pow(10, decimals));
    await mintTo(
      connection,
      wallet,
      mint.publicKey,
      tokenAccount,
      mintAuthority,
      mintAmount,
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
  }

  const tokenInfo = {
    name: options.name || 'CPI Guard Token',
    type: 'cpi-guard',
    mint: mint.publicKey.toBase58(),
    mintAuthority: mintAuthority.publicKey.toBase58(),
    cpiGuardAuthority: cpiGuardAuthority.toBase58(),
    decimals,
    tokenAccount: tokenAccount?.toBase58(),
    amount: options.amount,
    network: config.network,
    createdAt: new Date().toISOString()
  };

  const savedPath = saveTokenInfo(tokenInfo, config.outputDir);
  
  console.log(chalk.green('CPI Guard Token Created Successfully'));
  console.log(chalk.cyan(`Mint: ${tokenInfo.mint}`));
  console.log(chalk.cyan(`CPI Guard Authority: ${tokenInfo.cpiGuardAuthority}`));
  if (tokenAccount) {
    console.log(chalk.cyan(`Token Account: ${tokenAccount.toBase58()}`));
    console.log(chalk.cyan(`Amount: ${options.amount} tokens`));
  }
  console.log(chalk.gray(`Saved to: ${savedPath}`));
  
  return tokenInfo;
}

async function createTransferHookToken(options, config) {
  console.log(chalk.blue('Creating Transfer Hook Token...'));
  
  const connection = await getConnection(config.rpcUrl);
  const wallet = loadWallet(config.walletPath);
  const mint = Keypair.generate();
  const mintAuthority = Keypair.generate();
  const transferHookAuthority = options.transferHookAuthority ? new PublicKey(options.transferHookAuthority) : Keypair.generate().publicKey;
  
  const decimals = parseInt(options.decimals) || config.defaultDecimals;
  
  const extensions = [ExtensionType.TransferHook];
  const mintLen = getMintLen(extensions);
  const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeTransferHookInstruction(
      mint.publicKey,
      transferHookAuthority,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mint.publicKey,
      decimals,
      mintAuthority.publicKey,
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await sendAndConfirmTransaction(connection, transaction, [wallet, mint]);
  
  let tokenAccount = null;
  if (options.mint) {
    tokenAccount = await createAccount(
      connection,
      wallet,
      mint.publicKey,
      wallet.publicKey,
      undefined,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );

    const mintAmount = BigInt((options.amount || 1000) * Math.pow(10, decimals));
    await mintTo(
      connection,
      wallet,
      mint.publicKey,
      tokenAccount,
      mintAuthority,
      mintAmount,
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
  }

  const tokenInfo = {
    name: options.name || 'Transfer Hook Token',
    type: 'transfer-hook',
    mint: mint.publicKey.toBase58(),
    mintAuthority: mintAuthority.publicKey.toBase58(),
    transferHookAuthority: transferHookAuthority.toBase58(),
    decimals,
    tokenAccount: tokenAccount?.toBase58(),
    amount: options.amount,
    network: config.network,
    createdAt: new Date().toISOString()
  };

  const savedPath = saveTokenInfo(tokenInfo, config.outputDir);
  
  console.log(chalk.green('Transfer Hook Token Created Successfully'));
  console.log(chalk.cyan(`Mint: ${tokenInfo.mint}`));
  console.log(chalk.cyan(`Transfer Hook Authority: ${tokenInfo.transferHookAuthority}`));
  if (tokenAccount) {
    console.log(chalk.cyan(`Token Account: ${tokenAccount.toBase58()}`));
    console.log(chalk.cyan(`Amount: ${options.amount} tokens`));
  }
  console.log(chalk.gray(`Saved to: ${savedPath}`));
  
  return tokenInfo;
}

async function createGroupPointerToken(options, config) {
  console.log(chalk.blue('Creating Group Pointer Token...'));
  
  const connection = await getConnection(config.rpcUrl);
  const wallet = loadWallet(config.walletPath);
  const mint = Keypair.generate();
  const mintAuthority = Keypair.generate();
  const groupAuthority = options.groupAuthority ? new PublicKey(options.groupAuthority) : Keypair.generate().publicKey;
  
  const decimals = parseInt(options.decimals) || config.defaultDecimals;
  
  const extensions = [ExtensionType.GroupPointer];
  const mintLen = getMintLen(extensions);
  const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeGroupPointerInstruction(
      mint.publicKey,
      groupAuthority,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mint.publicKey,
      decimals,
      mintAuthority.publicKey,
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await sendAndConfirmTransaction(connection, transaction, [wallet, mint]);
  
  let tokenAccount = null;
  if (options.mint) {
    tokenAccount = await createAccount(
      connection,
      wallet,
      mint.publicKey,
      wallet.publicKey,
      undefined,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );

    const mintAmount = BigInt((options.amount || 1000) * Math.pow(10, decimals));
    await mintTo(
      connection,
      wallet,
      mint.publicKey,
      tokenAccount,
      mintAuthority,
      mintAmount,
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
  }

  const tokenInfo = {
    name: options.name || 'Group Pointer Token',
    type: 'group-pointer',
    mint: mint.publicKey.toBase58(),
    mintAuthority: mintAuthority.publicKey.toBase58(),
    groupAuthority: groupAuthority.toBase58(),
    decimals,
    tokenAccount: tokenAccount?.toBase58(),
    amount: options.amount,
    network: config.network,
    createdAt: new Date().toISOString()
  };

  const savedPath = saveTokenInfo(tokenInfo, config.outputDir);
  
  console.log(chalk.green('Group Pointer Token Created Successfully'));
  console.log(chalk.cyan(`Mint: ${tokenInfo.mint}`));
  console.log(chalk.cyan(`Group Authority: ${tokenInfo.groupAuthority}`));
  if (tokenAccount) {
    console.log(chalk.cyan(`Token Account: ${tokenAccount.toBase58()}`));
    console.log(chalk.cyan(`Amount: ${options.amount} tokens`));
  }
  console.log(chalk.gray(`Saved to: ${savedPath}`));
  
  return tokenInfo;
}

async function createMemberPointerToken(options, config) {
  console.log(chalk.blue('Creating Member Pointer Token...'));
  
  const connection = await getConnection(config.rpcUrl);
  const wallet = loadWallet(config.walletPath);
  const mint = Keypair.generate();
  const mintAuthority = Keypair.generate();
  const memberAuthority = options.memberAuthority ? new PublicKey(options.memberAuthority) : Keypair.generate().publicKey;
  
  const decimals = parseInt(options.decimals) || config.defaultDecimals;
  
  const extensions = [ExtensionType.MemberPointer];
  const mintLen = getMintLen(extensions);
  const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMemberPointerInstruction(
      mint.publicKey,
      memberAuthority,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mint.publicKey,
      decimals,
      mintAuthority.publicKey,
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await sendAndConfirmTransaction(connection, transaction, [wallet, mint]);
  
  let tokenAccount = null;
  if (options.mint) {
    tokenAccount = await createAccount(
      connection,
      wallet,
      mint.publicKey,
      wallet.publicKey,
      undefined,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );

    const mintAmount = BigInt((options.amount || 1000) * Math.pow(10, decimals));
    await mintTo(
      connection,
      wallet,
      mint.publicKey,
      tokenAccount,
      mintAuthority,
      mintAmount,
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
  }

  const tokenInfo = {
    name: options.name || 'Member Pointer Token',
    type: 'member-pointer',
    mint: mint.publicKey.toBase58(),
    mintAuthority: mintAuthority.publicKey.toBase58(),
    memberAuthority: memberAuthority.toBase58(),
    decimals,
    tokenAccount: tokenAccount?.toBase58(),
    amount: options.amount,
    network: config.network,
    createdAt: new Date().toISOString()
  };

  const savedPath = saveTokenInfo(tokenInfo, config.outputDir);
  
  console.log(chalk.green('Member Pointer Token Created Successfully'));
  console.log(chalk.cyan(`Mint: ${tokenInfo.mint}`));
  console.log(chalk.cyan(`Member Authority: ${tokenInfo.memberAuthority}`));
  if (tokenAccount) {
    console.log(chalk.cyan(`Token Account: ${tokenAccount.toBase58()}`));
    console.log(chalk.cyan(`Amount: ${options.amount} tokens`));
  }
  console.log(chalk.gray(`Saved to: ${savedPath}`));
  
  return tokenInfo;
}

async function createDefaultAccountStateToken(options, config) {
  console.log(chalk.blue('Creating Default Account State Token...'));
  
  const connection = await getConnection(config.rpcUrl);
  const wallet = loadWallet(config.walletPath);
  const mint = Keypair.generate();
  const mintAuthority = Keypair.generate();
  
  const decimals = parseInt(options.decimals) || config.defaultDecimals;
  const accountState = options.accountState || AccountState.Frozen;
  
  const extensions = [ExtensionType.DefaultAccountState];
  const mintLen = getMintLen(extensions);
  const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeDefaultAccountStateInstruction(
      mint.publicKey,
      accountState,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mint.publicKey,
      decimals,
      mintAuthority.publicKey,
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await sendAndConfirmTransaction(connection, transaction, [wallet, mint]);
  
  let tokenAccount = null;
  if (options.mint) {
    tokenAccount = await createAccount(
      connection,
      wallet,
      mint.publicKey,
      wallet.publicKey,
      undefined,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );

    const mintAmount = BigInt((options.amount || 1000) * Math.pow(10, decimals));
    await mintTo(
      connection,
      wallet,
      mint.publicKey,
      tokenAccount,
      mintAuthority,
      mintAmount,
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
  }

  const tokenInfo = {
    name: options.name || 'Default Account State Token',
    type: 'default-account-state',
    mint: mint.publicKey.toBase58(),
    mintAuthority: mintAuthority.publicKey.toBase58(),
    defaultAccountState: accountState,
    decimals,
    tokenAccount: tokenAccount?.toBase58(),
    amount: options.amount,
    network: config.network,
    createdAt: new Date().toISOString()
  };

  const savedPath = saveTokenInfo(tokenInfo, config.outputDir);
  
  console.log(chalk.green('Default Account State Token Created Successfully'));
  console.log(chalk.cyan(`Mint: ${tokenInfo.mint}`));
  console.log(chalk.cyan(`Default Account State: ${accountState}`));
  if (tokenAccount) {
    console.log(chalk.cyan(`Token Account: ${tokenAccount.toBase58()}`));
    console.log(chalk.cyan(`Amount: ${options.amount} tokens`));
  }
  console.log(chalk.gray(`Saved to: ${savedPath}`));
  
  return tokenInfo;
}

async function createPermanentDelegateToken(options, config) {
  console.log(chalk.blue('Creating Permanent Delegate Token...'));
  
  const connection = await getConnection(config.rpcUrl);
  const wallet = loadWallet(config.walletPath);
  const mint = Keypair.generate();
  const mintAuthority = Keypair.generate();
  const permanentDelegate = options.permanentDelegate ? new PublicKey(options.permanentDelegate) : Keypair.generate().publicKey;
  
  const decimals = parseInt(options.decimals) || config.defaultDecimals;
  
  const extensions = [ExtensionType.PermanentDelegate];
  const mintLen = getMintLen(extensions);
  const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializePermanentDelegateInstruction(
      mint.publicKey,
      permanentDelegate,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mint.publicKey,
      decimals,
      mintAuthority.publicKey,
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await sendAndConfirmTransaction(connection, transaction, [wallet, mint]);
  
  let tokenAccount = null;
  if (options.mint) {
    tokenAccount = await createAccount(
      connection,
      wallet,
      mint.publicKey,
      wallet.publicKey,
      undefined,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );

    const mintAmount = BigInt((options.amount || 1000) * Math.pow(10, decimals));
    await mintTo(
      connection,
      wallet,
      mint.publicKey,
      tokenAccount,
      mintAuthority,
      mintAmount,
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
  }

  const tokenInfo = {
    name: options.name || 'Permanent Delegate Token',
    type: 'permanent-delegate',
    mint: mint.publicKey.toBase58(),
    mintAuthority: mintAuthority.publicKey.toBase58(),
    permanentDelegate: permanentDelegate.toBase58(),
    decimals,
    tokenAccount: tokenAccount?.toBase58(),
    amount: options.amount,
    network: config.network,
    createdAt: new Date().toISOString()
  };

  const savedPath = saveTokenInfo(tokenInfo, config.outputDir);
  
  console.log(chalk.green('Permanent Delegate Token Created Successfully'));
  console.log(chalk.cyan(`Mint: ${tokenInfo.mint}`));
  console.log(chalk.cyan(`Permanent Delegate: ${tokenInfo.permanentDelegate}`));
  if (tokenAccount) {
    console.log(chalk.cyan(`Token Account: ${tokenAccount.toBase58()}`));
    console.log(chalk.cyan(`Amount: ${options.amount} tokens`));
  }
  console.log(chalk.gray(`Saved to: ${savedPath}`));
  
  return tokenInfo;
}

async function createMetadataPointerToken(options, config) {
  console.log(chalk.blue('Creating Metadata Pointer Token...'));
  
  const connection = await getConnection(config.rpcUrl);
  const wallet = loadWallet(config.walletPath);
  const mint = Keypair.generate();
  const mintAuthority = Keypair.generate();
  const metadataAuthority = options.metadataAuthority ? new PublicKey(options.metadataAuthority) : Keypair.generate().publicKey;
  
  const decimals = parseInt(options.decimals) || config.defaultDecimals;
  
  const extensions = [ExtensionType.MetadataPointer];
  const mintLen = getMintLen(extensions);
  const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMetadataPointerInstruction(
      mint.publicKey,
      metadataAuthority,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mint.publicKey,
      decimals,
      mintAuthority.publicKey,
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await sendAndConfirmTransaction(connection, transaction, [wallet, mint]);
  
  let tokenAccount = null;
  if (options.mint) {
    tokenAccount = await createAccount(
      connection,
      wallet,
      mint.publicKey,
      wallet.publicKey,
      undefined,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );

    const mintAmount = BigInt((options.amount || 1000) * Math.pow(10, decimals));
    await mintTo(
      connection,
      wallet,
      mint.publicKey,
      tokenAccount,
      mintAuthority,
      mintAmount,
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
  }

  const tokenInfo = {
    name: options.name || 'Metadata Pointer Token',
    type: 'metadata-pointer',
    mint: mint.publicKey.toBase58(),
    mintAuthority: mintAuthority.publicKey.toBase58(),
    metadataAuthority: metadataAuthority.toBase58(),
    decimals,
    tokenAccount: tokenAccount?.toBase58(),
    amount: options.amount,
    network: config.network,
    createdAt: new Date().toISOString()
  };

  const savedPath = saveTokenInfo(tokenInfo, config.outputDir);
  
  console.log(chalk.green('Metadata Pointer Token Created Successfully'));
  console.log(chalk.cyan(`Mint: ${tokenInfo.mint}`));
  console.log(chalk.cyan(`Metadata Authority: ${tokenInfo.metadataAuthority}`));
  if (tokenAccount) {
    console.log(chalk.cyan(`Token Account: ${tokenAccount.toBase58()}`));
    console.log(chalk.cyan(`Amount: ${options.amount} tokens`));
  }
  console.log(chalk.gray(`Saved to: ${savedPath}`));
  
  return tokenInfo;
}

async function createMultiExtensionToken(options, config) {
  console.log(chalk.blue('Creating Multi-Extension Token...'));
  
  const connection = await getConnection(config.rpcUrl);
  const wallet = loadWallet(config.walletPath);
  const mint = Keypair.generate();
  const mintAuthority = Keypair.generate();
  
  const decimals = parseInt(options.decimals) || config.defaultDecimals;
  const extensions = [];
  const instructions = [];
  
  // Parse extension options
  if (options.transferFee) {
    extensions.push(ExtensionType.TransferFeeConfig);
    const feeBasisPoints = parseInt(options.feeBasisPoints) || 100;
    // Convert whole tokens to smallest units (1 token = 10^decimals smallest units)
    const maxFeeTokens = parseInt(options.maxFee) || 1;
    const maxFee = BigInt(maxFeeTokens * Math.pow(10, decimals));
    const transferFeeAuthority = options.feeAuthority ? new PublicKey(options.feeAuthority) : Keypair.generate().publicKey;
    const withdrawAuthority = options.withdrawAuthority ? new PublicKey(options.withdrawAuthority) : Keypair.generate().publicKey;
    
    instructions.push(createInitializeTransferFeeConfigInstruction(
      mint.publicKey,
      transferFeeAuthority,
      withdrawAuthority,
      feeBasisPoints,
      maxFee,
      TOKEN_2022_PROGRAM_ID
    ));
  }
  
  if (options.interestBearing) {
    extensions.push(ExtensionType.InterestBearingConfig);
    // 1% = 100 basis points
    const ratePercentage = parseInt(options.rate) || 5;
    const rate = ratePercentage * 100;
    const rateAuthority = options.rateAuthority ? new PublicKey(options.rateAuthority) : Keypair.generate().publicKey;
    
    instructions.push(createInitializeInterestBearingMintInstruction(
      mint.publicKey,
      rateAuthority,
      rate,
      TOKEN_2022_PROGRAM_ID
    ));
  }
  
  if (options.nonTransferable) {
    extensions.push(ExtensionType.NonTransferable);
    instructions.push(createInitializeNonTransferableMintInstruction(
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID
    ));
  }
  
  if (options.closeable) {
    extensions.push(ExtensionType.MintCloseAuthority);
    const closeAuthority = options.closeAuthority ? new PublicKey(options.closeAuthority) : Keypair.generate().publicKey;
    instructions.push(createInitializeMintCloseAuthorityInstruction(
      mint.publicKey,
      closeAuthority,
      TOKEN_2022_PROGRAM_ID
    ));
  }
  
  if (options.defaultAccountState) {
    extensions.push(ExtensionType.DefaultAccountState);
    const accountState = options.accountState || AccountState.Initialized;
    instructions.push(createInitializeDefaultAccountStateInstruction(
      mint.publicKey,
      accountState,
      TOKEN_2022_PROGRAM_ID
    ));
  }
  
  if (options.permanentDelegate) {
    extensions.push(ExtensionType.PermanentDelegate);
    const permanentDelegate = options.permanentDelegateKey ? new PublicKey(options.permanentDelegateKey) : Keypair.generate().publicKey;
    instructions.push(createInitializePermanentDelegateInstruction(
      mint.publicKey,
      permanentDelegate,
      TOKEN_2022_PROGRAM_ID
    ));
  }
  
  if (options.metadataPointer) {
    extensions.push(ExtensionType.MetadataPointer);
    const metadataAuthority = options.metadataAuthority ? new PublicKey(options.metadataAuthority) : Keypair.generate().publicKey;
    instructions.push(createInitializeMetadataPointerInstruction(
      mint.publicKey,
      metadataAuthority,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID
    ));
  }
  
  if (extensions.length === 0) {
    console.log(chalk.yellow('No extensions specified. Use --help to see available options.'));
    return;
  }
  
  const mintLen = getMintLen(extensions);
  const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  // Determine freeze authority - required when Default Account State is used
  let freezeAuthority = null;
  if (options.defaultAccountState) {
    freezeAuthority = options.freezeAuthority ? new PublicKey(options.freezeAuthority) : mintAuthority.publicKey;
  }

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    ...instructions,
    createInitializeMintInstruction(
      mint.publicKey,
      decimals,
      mintAuthority.publicKey,
      freezeAuthority,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await sendAndConfirmTransaction(connection, transaction, [wallet, mint]);
  
  let tokenAccount = null;
  if (options.mint) {
    tokenAccount = await createAccount(
      connection,
      wallet,
      mint.publicKey,
      wallet.publicKey,
      undefined,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );

    const mintAmount = BigInt((options.amount || 1000) * Math.pow(10, decimals));
    await mintTo(
      connection,
      wallet,
      mint.publicKey,
      tokenAccount,
      mintAuthority,
      mintAmount,
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
  }

  const tokenInfo = {
    name: options.name || 'Multi-Extension Token',
    type: 'multi-extension',
    mint: mint.publicKey.toBase58(),
    mintAuthority: mintAuthority.publicKey.toBase58(),
    extensions: extensions.map(ext => ExtensionType[ext]),
    decimals,
    tokenAccount: tokenAccount?.toBase58(),
    amount: options.amount,
    network: config.network,
    createdAt: new Date().toISOString()
  };

  const savedPath = saveTokenInfo(tokenInfo, config.outputDir);
  
  console.log(chalk.green('Multi-Extension Token Created Successfully'));
  console.log(chalk.cyan(`Mint: ${tokenInfo.mint}`));
  console.log(chalk.cyan(`Extensions: ${extensions.length} active`));
  console.log(chalk.cyan(`Extension Types: ${tokenInfo.extensions.join(', ')}`));
  if (tokenAccount) {
    console.log(chalk.cyan(`Token Account: ${tokenAccount.toBase58()}`));
    console.log(chalk.cyan(`Amount: ${options.amount} tokens`));
  }
  console.log(chalk.gray(`Saved to: ${savedPath}`));
  
  return tokenInfo;
}

async function createScaledUIAmountToken(options, config) {
  console.log(chalk.blue('Creating Scaled UI Amount Token...'));
  console.log(chalk.yellow('Note: This extension requires additional implementation beyond base SPL Token'));
  
  // For now, create a basic token with note about scaling
  const connection = await getConnection(config.rpcUrl);
  const wallet = loadWallet(config.walletPath);
  const mint = Keypair.generate();
  const mintAuthority = Keypair.generate();
  
  const decimals = parseInt(options.decimals) || config.defaultDecimals;
  
  const extensions = [];
  const mintLen = getMintLen(extensions);
  const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMintInstruction(
      mint.publicKey,
      decimals,
      mintAuthority.publicKey,
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await sendAndConfirmTransaction(connection, transaction, [wallet, mint]);
  
  const tokenInfo = {
    name: options.name || 'Scaled UI Amount Token',
    type: 'scaled-ui-amount',
    mint: mint.publicKey.toBase58(),
    mintAuthority: mintAuthority.publicKey.toBase58(),
    decimals,
    scaleFactor: options.scaleFactor || 1,
    network: config.network,
    createdAt: new Date().toISOString(),
    note: 'UI scaling requires client-side implementation'
  };

  const savedPath = saveTokenInfo(tokenInfo, config.outputDir);
  
  console.log(chalk.green('Scaled UI Amount Token Created Successfully'));
  console.log(chalk.cyan(`Mint: ${tokenInfo.mint}`));
  console.log(chalk.cyan(`Scale Factor: ${tokenInfo.scaleFactor}`));
  console.log(chalk.yellow(`Note: ${tokenInfo.note}`));
  console.log(chalk.gray(`Saved to: ${savedPath}`));
  
  return tokenInfo;
}

// Add after createMetadataPointerToken function
async function createFullMetadataToken(options, config) {
  console.log(chalk.blue('Creating Full Metadata Token...'));
  
  const connection = await getConnection(config.rpcUrl);
  const wallet = loadWallet(config.walletPath);
  const mint = Keypair.generate();
  const mintAuthority = Keypair.generate();
  const updateAuthority = options.updateAuthority ? new PublicKey(options.updateAuthority) : mintAuthority.publicKey;
  
  const decimals = parseInt(options.decimals) || config.defaultDecimals;
  const tokenName = options.tokenName || options.name || 'Custom Token';
  const symbol = options.symbol || 'CTK';
  const description = options.description || 'A custom token with metadata';
  const image = options.image || '';
  const externalUrl = options.externalUrl || '';
  
  // Create URI from metadata
  const metadata = {
    name: tokenName,
    symbol: symbol,
    description: description,
    image: image,
    external_url: externalUrl,
    attributes: []
  };
  
  // For this demo, we'll use a simple JSON string as URI
  // In production, this should be uploaded to IPFS or another storage service
  const uri = options.uri || `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString('base64')}`;
  
  const extensions = [ExtensionType.MetadataPointer];
  const mintLen = getMintLen(extensions);
  const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMetadataPointerInstruction(
      mint.publicKey,
      updateAuthority,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mint.publicKey,
      decimals,
      mintAuthority.publicKey,
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );

  // Add metadata initialization if available
  if (createInitializeMetadataInstruction) {
    transaction.add(
      createInitializeMetadataInstruction({
        programId: TOKEN_2022_PROGRAM_ID,
        metadata: mint.publicKey,
        updateAuthority: updateAuthority,
        mint: mint.publicKey,
        mintAuthority: mintAuthority.publicKey,
        name: tokenName,
        symbol: symbol,
        uri: uri,
      })
    );
  }

  await sendAndConfirmTransaction(connection, transaction, [wallet, mint]);
  
  let tokenAccount = null;
  if (options.mint) {
    tokenAccount = await createAccount(
      connection,
      wallet,
      mint.publicKey,
      wallet.publicKey,
      undefined,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );

    const mintAmount = BigInt((options.amount || 1000) * Math.pow(10, decimals));
    await mintTo(
      connection,
      wallet,
      mint.publicKey,
      tokenAccount,
      mintAuthority,
      mintAmount,
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
  }

  const tokenInfo = {
    name: options.name || 'Full Metadata Token',
    type: 'full-metadata',
    mint: mint.publicKey.toBase58(),
    mintAuthority: mintAuthority.publicKey.toBase58(),
    updateAuthority: updateAuthority.toBase58(),
    metadata: {
      tokenName,
      symbol,
      description,
      image,
      externalUrl,
      uri
    },
    decimals,
    tokenAccount: tokenAccount?.toBase58(),
    amount: options.amount,
    network: config.network,
    createdAt: new Date().toISOString()
  };

  const savedPath = saveTokenInfo(tokenInfo, config.outputDir);
  
  console.log(chalk.green('Full Metadata Token Created Successfully'));
  console.log(chalk.cyan(`Mint: ${tokenInfo.mint}`));
  console.log(chalk.cyan(`Token Name: ${tokenName}`));
  console.log(chalk.cyan(`Symbol: ${symbol}`));
  console.log(chalk.cyan(`Description: ${description}`));
  if (image) console.log(chalk.cyan(`Image: ${image}`));
  if (externalUrl) console.log(chalk.cyan(`External URL: ${externalUrl}`));
  console.log(chalk.cyan(`Update Authority: ${tokenInfo.updateAuthority}`));
  if (tokenAccount) {
    console.log(chalk.cyan(`Token Account: ${tokenAccount.toBase58()}`));
    console.log(chalk.cyan(`Amount: ${options.amount} tokens`));
  }
  console.log(chalk.gray(`Saved to: ${savedPath}`));
  
  return tokenInfo;
}

// Enhanced interactive prompts
async function promptForTokenDetails(defaults = {}) {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Token name:',
      default: defaults.name || 'My Custom Token',
      validate: (input) => input.trim().length > 0 || 'Token name is required'
    },
    {
      type: 'number',
      name: 'decimals',
      message: 'Number of decimals (0-9):',
      default: defaults.decimals || 6,
      validate: (input) => validateDecimals(input) || 'Decimals must be between 0 and 9'
    },
    {
      type: 'confirm',
      name: 'mintTokens',
      message: 'Do you want to mint tokens after creation?',
      default: defaults.mintTokens !== false
    },
    {
      type: 'number',
      name: 'amount',
      message: 'How many tokens to mint:',
      default: defaults.amount || 1000,
      validate: (input) => validateAmount(input) || 'Amount must be greater than 0',
      when: (answers) => answers.mintTokens
    }
  ]);
  
  return answers;
}

async function promptForTransferFeeDetails() {
  return await inquirer.prompt([
    {
      type: 'number',
      name: 'feeBasisPoints',
      message: 'Transfer fee percentage (1 = 0.01%, 100 = 1%):',
      default: 100,
      validate: (input) => validateFeeBasisPoints(input) || 'Fee must be between 0 and 10000 basis points'
    },
    {
      type: 'number',
      name: 'maxFee',
      message: 'Maximum fee amount in tokens (1 = 1 token):',
      default: 1,
      validate: (input) => input > 0 || 'Maximum fee must be greater than 0'
    },
    {
      type: 'input',
      name: 'feeAuthority',
      message: 'Transfer fee authority (optional, press Enter to auto-generate):',
      validate: (input) => !input || validatePublicKey(input) || 'Invalid public key format'
    },
    {
      type: 'input',
      name: 'withdrawAuthority',
      message: 'Withdraw authority (optional, press Enter to auto-generate):',
      validate: (input) => !input || validatePublicKey(input) || 'Invalid public key format'
    }
  ]);
}

async function promptForInterestBearingDetails() {
  return await inquirer.prompt([
    {
      type: 'number',
      name: 'rate',
      message: 'Annual interest rate percentage (1 = 1%):',
      default: 5,
      validate: (input) => validateInterestRate(input) || 'Rate must be between -100% and +100%'
    },
    {
      type: 'input',
      name: 'rateAuthority',
      message: 'Rate authority (optional, press Enter to auto-generate):',
      validate: (input) => !input || validatePublicKey(input) || 'Invalid public key format'
    }
  ]);
}

async function promptForMultiExtensionDetails() {
  return await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'extensions',
      message: 'Select extensions to include:',
      choices: [
        { name: 'Transfer Fee Config', value: 'transfer-fee' },
        { name: 'Interest Bearing Config', value: 'interest-bearing' },
        { name: 'Non-Transferable (Soulbound)', value: 'non-transferable' },
        { name: 'Mint Close Authority', value: 'closeable' },
        { name: 'Default Account State', value: 'default-account-state' },
        { name: 'Permanent Delegate', value: 'permanent-delegate' },
        { name: 'Metadata Pointer', value: 'metadata-pointer' }
      ]
    }
  ]);
}

// CLI Commands
program
  .name('token-extensions-cli')
  .description('CLI tool for creating Token-2022 extensions with enhanced customization')
  .version('1.0.0');

program
  .command('config')
  .description('Configure CLI settings')
  .option('-n, --network <network>', 'Network (devnet, testnet, mainnet-beta)')
  .option('-r, --rpc-url <url>', 'Custom RPC URL')
  .option('-w, --wallet-path <path>', 'Wallet file path')
  .option('-o, --output-dir <dir>', 'Output directory for token info')
  .option('-d, --default-decimals <decimals>', 'Default decimals for tokens')
  .option('--default-fee-basis-points <points>', 'Default transfer fee basis points')
  .option('--default-max-fee <amount>', 'Default maximum transfer fee')
  .option('--default-interest-rate <rate>', 'Default interest rate basis points')
  .option('--default-amount <amount>', 'Default token amount to mint')
  .option('--confirm-transactions <bool>', 'Ask for confirmation before transactions')
  .option('--save-token-info <bool>', 'Save token information to files')
  .option('--show-detailed-output <bool>', 'Show detailed transaction output')
  .option('--show', 'Show current configuration')
  .option('--interactive', 'Configure settings interactively')
  .action(async (options) => {
    const config = loadConfig();
    
    if (options.show) {
      console.log(chalk.blue('Current Configuration:'));
      console.log(chalk.cyan('Network:'), config.network);
      console.log(chalk.cyan('RPC URL:'), config.rpcUrl);
      console.log(chalk.cyan('Wallet Path:'), config.walletPath);
      console.log(chalk.cyan('Output Directory:'), config.outputDir);
      console.log(chalk.cyan('Default Decimals:'), config.defaultDecimals);
      console.log(chalk.cyan('Default Fee Basis Points:'), config.defaultFeeBasisPoints);
      console.log(chalk.cyan('Default Max Fee:'), config.defaultMaxFee);
      console.log(chalk.cyan('Default Interest Rate:'), config.defaultInterestRate);
      console.log(chalk.cyan('Default Amount:'), config.defaultAmount);
      console.log(chalk.cyan('Confirm Transactions:'), config.confirmTransactions);
      console.log(chalk.cyan('Save Token Info:'), config.saveTokenInfo);
      console.log(chalk.cyan('Show Detailed Output:'), config.showDetailedOutput);
      return;
    }
    
    if (options.interactive) {
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'network',
          message: 'Select network:',
          choices: [
            { name: 'Devnet (recommended for testing)', value: 'devnet' },
            { name: 'Testnet', value: 'testnet' },
            { name: 'Mainnet Beta', value: 'mainnet-beta' },
            { name: 'Localnet', value: 'localnet' }
          ],
          default: config.network
        },
        {
          type: 'input',
          name: 'rpcUrl',
          message: 'RPC URL (press Enter for default):',
          default: config.rpcUrl
        },
        {
          type: 'input',
          name: 'walletPath',
          message: 'Wallet file path:',
          default: config.walletPath
        },
        {
          type: 'input',
          name: 'outputDir',
          message: 'Output directory for token info:',
          default: config.outputDir
        },
        {
          type: 'number',
          name: 'defaultDecimals',
          message: 'Default decimals for tokens (0-9):',
          default: config.defaultDecimals,
          validate: (input) => validateDecimals(input) || 'Decimals must be between 0 and 9'
        },
        {
          type: 'number',
          name: 'defaultFeeBasisPoints',
          message: 'Default transfer fee basis points:',
          default: config.defaultFeeBasisPoints,
          validate: (input) => validateFeeBasisPoints(input) || 'Fee must be between 0 and 10000'
        },
        {
          type: 'number',
          name: 'defaultMaxFee',
          message: 'Default maximum transfer fee:',
          default: config.defaultMaxFee,
          validate: (input) => input > 0 || 'Max fee must be greater than 0'
        },
        {
          type: 'number',
          name: 'defaultInterestRate',
          message: 'Default interest rate basis points:',
          default: config.defaultInterestRate,
          validate: (input) => validateInterestRate(input) || 'Rate must be between -10000 and 10000'
        },
        {
          type: 'number',
          name: 'defaultAmount',
          message: 'Default token amount to mint:',
          default: config.defaultAmount,
          validate: (input) => validateAmount(input) || 'Amount must be greater than 0'
        },
        {
          type: 'confirm',
          name: 'confirmTransactions',
          message: 'Ask for confirmation before transactions?',
          default: config.confirmTransactions
        },
        {
          type: 'confirm',
          name: 'saveTokenInfo',
          message: 'Save token information to files?',
          default: config.saveTokenInfo
        },
        {
          type: 'confirm',
          name: 'showDetailedOutput',
          message: 'Show detailed transaction output?',
          default: config.showDetailedOutput
        }
      ]);
      
      const newConfig = { ...config, ...answers };
      
      // Set default RPC URL based on network if not custom
      if (answers.network && !answers.rpcUrl) {
        const rpcUrls = {
          'devnet': 'https://api.devnet.solana.com',
          'testnet': 'https://api.testnet.solana.com',
          'mainnet-beta': 'https://api.mainnet-beta.solana.com',
          'localnet': 'http://localhost:8899'
        };
        newConfig.rpcUrl = rpcUrls[answers.network] || newConfig.rpcUrl;
      }
      
      if (saveConfig(newConfig)) {
        console.log(chalk.green('Configuration updated successfully'));
      } else {
        console.log(chalk.red('Failed to save configuration'));
      }
      return;
    }
    
    const newConfig = { ...config };
    if (options.network) {
      if (!validateNetwork(options.network)) {
        console.error(chalk.red('Invalid network. Use: devnet, testnet, mainnet-beta, or localnet'));
        return;
      }
      newConfig.network = options.network;
    }
    if (options.rpcUrl) newConfig.rpcUrl = options.rpcUrl;
    if (options.walletPath) newConfig.walletPath = options.walletPath;
    if (options.outputDir) newConfig.outputDir = options.outputDir;
    if (options.defaultDecimals) {
      const decimals = parseInt(options.defaultDecimals);
      if (!validateDecimals(decimals)) {
        console.error(chalk.red('Invalid decimals. Must be between 0 and 9'));
        return;
      }
      newConfig.defaultDecimals = decimals;
    }
    if (options.defaultFeeBasisPoints) {
      const fee = parseInt(options.defaultFeeBasisPoints);
      if (!validateFeeBasisPoints(fee)) {
        console.error(chalk.red('Invalid fee basis points. Must be between 0 and 10000'));
        return;
      }
      newConfig.defaultFeeBasisPoints = fee;
    }
    if (options.defaultMaxFee) {
      const maxFee = parseInt(options.defaultMaxFee);
      if (maxFee <= 0) {
        console.error(chalk.red('Invalid max fee. Must be greater than 0'));
        return;
      }
      newConfig.defaultMaxFee = maxFee;
    }
    if (options.defaultInterestRate) {
      const rate = parseInt(options.defaultInterestRate);
      if (!validateInterestRate(rate)) {
        console.error(chalk.red('Invalid interest rate. Must be between -10000 and 10000'));
        return;
      }
      newConfig.defaultInterestRate = rate;
    }
    if (options.defaultAmount) {
      const amount = parseFloat(options.defaultAmount);
      if (!validateAmount(amount)) {
        console.error(chalk.red('Invalid amount. Must be greater than 0'));
        return;
      }
      newConfig.defaultAmount = amount;
    }
    if (options.confirmTransactions !== undefined) {
      newConfig.confirmTransactions = options.confirmTransactions === 'true';
    }
    if (options.saveTokenInfo !== undefined) {
      newConfig.saveTokenInfo = options.saveTokenInfo === 'true';
    }
    if (options.showDetailedOutput !== undefined) {
      newConfig.showDetailedOutput = options.showDetailedOutput === 'true';
    }
    
    if (options.network && !options.rpcUrl) {
      const rpcUrls = {
        'devnet': 'https://api.devnet.solana.com',
        'testnet': 'https://api.testnet.solana.com',
        'mainnet-beta': 'https://api.mainnet-beta.solana.com',
        'localnet': 'http://localhost:8899'
      };
      newConfig.rpcUrl = rpcUrls[options.network] || newConfig.rpcUrl;
    }
    
    if (saveConfig(newConfig)) {
      console.log(chalk.green('Configuration updated successfully'));
    } else {
      console.log(chalk.red('Failed to save configuration'));
    }
  });

program
  .command('setup')
  .description('Interactive setup wizard for first-time users')
  .action(async () => {
    console.log(chalk.blue('Token-2022 Extensions CLI Setup Wizard'));
    console.log(chalk.gray('Let\'s configure your environment...\n'));
    
    const config = loadConfig();
    
    // Check if wallet exists
    if (!fs.existsSync(config.walletPath)) {
      console.log(chalk.yellow('No wallet found. Let\'s create one...'));
      const walletAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'walletAction',
          message: 'What would you like to do?',
          choices: [
            { name: 'Create a new wallet', value: 'create' },
            { name: 'Use existing wallet file', value: 'existing' },
            { name: 'Skip for now', value: 'skip' }
          ]
        }
      ]);
      
      if (walletAnswer.walletAction === 'create') {
        console.log(chalk.blue('Creating new wallet...'));
        try {
          const { execSync } = require('child_process');
          execSync(`solana-keygen new --outfile ${config.walletPath} --no-bip39-passphrase`, { stdio: 'inherit' });
          console.log(chalk.green('Wallet created successfully'));
        } catch (error) {
          console.error(chalk.red('Failed to create wallet:'), error.message);
          console.log(chalk.yellow('Please run: solana-keygen new --outfile wallet.json'));
        }
      } else if (walletAnswer.walletAction === 'existing') {
        const pathAnswer = await inquirer.prompt([
          {
            type: 'input',
            name: 'walletPath',
            message: 'Path to your wallet file:',
            default: './wallet.json'
          }
        ]);
        config.walletPath = pathAnswer.walletPath;
      }
    }
    
    // Network configuration
    const networkAnswer = await inquirer.prompt([
      {
        type: 'list',
        name: 'network',
        message: 'Select your preferred network:',
        choices: [
          { name: 'Devnet (recommended for testing)', value: 'devnet' },
          { name: 'Testnet', value: 'testnet' },
          { name: 'Mainnet Beta (real SOL)', value: 'mainnet-beta' },
          { name: 'Localnet (local validator)', value: 'localnet' }
        ],
        default: config.network
      }
    ]);
    
    config.network = networkAnswer.network;
    
    // Set RPC URL based on network
    const rpcUrls = {
      'devnet': 'https://api.devnet.solana.com',
      'testnet': 'https://api.testnet.solana.com',
      'mainnet-beta': 'https://api.mainnet-beta.solana.com',
      'localnet': 'http://localhost:8899'
    };
    config.rpcUrl = rpcUrls[networkAnswer.network];
    
    // Default settings
    const defaultsAnswer = await inquirer.prompt([
      {
        type: 'number',
        name: 'defaultDecimals',
        message: 'Default decimals for tokens (0-9):',
        default: config.defaultDecimals,
        validate: (input) => validateDecimals(input) || 'Decimals must be between 0 and 9'
      },
      {
        type: 'number',
        name: 'defaultAmount',
        message: 'Default amount to mint (tokens):',
        default: config.defaultAmount,
        validate: (input) => validateAmount(input) || 'Amount must be greater than 0'
      },
      {
        type: 'confirm',
        name: 'saveTokenInfo',
        message: 'Save token information to files?',
        default: config.saveTokenInfo
      }
    ]);
    
    Object.assign(config, defaultsAnswer);
    
    if (saveConfig(config)) {
      console.log(chalk.green('\nSetup completed successfully!'));
      console.log(chalk.cyan('\nNext steps:'));
      console.log(chalk.gray('1. Get SOL for testing: solana airdrop 2'));
      console.log(chalk.gray('2. Try interactive mode: token-extensions-cli interactive'));
      console.log(chalk.gray('3. View examples: token-extensions-cli examples'));
    } else {
      console.log(chalk.red('\nSetup failed'));
    }
  });

program
  .command('create-transfer-fee')
  .description('Create a token with transfer fees')
  .option('-n, --name <name>', 'Token name', 'Transfer Fee Token')
  .option('-d, --decimals <decimals>', 'Token decimals')
  .option('-f, --fee-basis-points <points>', 'Fee in basis points (100 = 1%)', '100')
  .option('-m, --max-fee <amount>', 'Maximum fee amount in tokens (1 = 1 token)', '1')
  .option('--fee-authority <pubkey>', 'Transfer fee authority')
  .option('--withdraw-authority <pubkey>', 'Withdraw authority')
  .option('--mint', 'Mint tokens after creation')
  .option('-a, --amount <amount>', 'Amount to mint', '1000')
  .action(async (options) => {
    try {
      const config = loadConfig();
      await createTransferFeeToken(options, config);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program
  .command('create-interest-bearing')
  .description('Create a token with interest accrual')
  .option('-n, --name <name>', 'Token name', 'Interest-Bearing Token')
  .option('-d, --decimals <decimals>', 'Token decimals')
  .option('-r, --rate <rate>', 'Interest rate percentage (1 = 1%)', '5')
  .option('--rate-authority <pubkey>', 'Rate authority')
  .option('--mint', 'Mint tokens after creation')
  .option('-a, --amount <amount>', 'Amount to mint', '1000')
  .action(async (options) => {
    try {
      const config = loadConfig();
      await createInterestBearingToken(options, config);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program
  .command('create-soulbound')
  .description('Create a non-transferable (soulbound) token')
  .option('-n, --name <name>', 'Token name', 'Soulbound Token')
  .option('-d, --decimals <decimals>', 'Token decimals', '0')
  .option('--mint', 'Mint tokens after creation')
  .option('-a, --amount <amount>', 'Amount to mint', '1')
  .action(async (options) => {
    try {
      const config = loadConfig();
      await createSoulboundToken(options, config);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program
  .command('create-closeable')
  .description('Create a token with a close authority')
  .option('-n, --name <name>', 'Token name', 'Closeable Token')
  .option('-d, --decimals <decimals>', 'Token decimals')
  .option('--close-authority <pubkey>', 'Close authority')
  .option('--mint', 'Mint tokens after creation')
  .option('-a, --amount <amount>', 'Amount to mint', '1000')
  .action(async (options) => {
    try {
      const config = loadConfig();
      await createCloseableToken(options, config);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program
  .command('create-frozen')
  .description('Create a token with an immutable owner')
  .option('-n, --name <name>', 'Token name', 'Frozen Default Token')
  .option('-d, --decimals <decimals>', 'Token decimals')
  .option('--mint', 'Mint tokens after creation')
  .option('-a, --amount <amount>', 'Amount to mint', '1000')
  .action(async (options) => {
    try {
      const config = loadConfig();
      await createFrozenDefaultToken(options, config);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program
  .command('create-required-memo-transfers')
  .description('Create a token with required memo transfers')
  .option('-n, --name <name>', 'Token name', 'Required Memo Transfers Token')
  .option('-d, --decimals <decimals>', 'Token decimals')
  .option('--memo-authority <pubkey>', 'Memo authority')
  .option('--mint', 'Mint tokens after creation')
  .option('-a, --amount <amount>', 'Amount to mint', '1000')
  .action(async (options) => {
    try {
      const config = loadConfig();
      await createRequiredMemoTransfersToken(options, config);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program
  .command('create-cpi-guard')
  .description('Create a token with a CPI guard')
  .option('-n, --name <name>', 'Token name', 'CPI Guard Token')
  .option('-d, --decimals <decimals>', 'Token decimals')
  .option('--cpi-guard-authority <pubkey>', 'CPI guard authority')
  .option('--mint', 'Mint tokens after creation')
  .option('-a, --amount <amount>', 'Amount to mint', '1000')
  .action(async (options) => {
    try {
      const config = loadConfig();
      await createCpiGuardToken(options, config);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program
  .command('create-transfer-hook')
  .description('Create a token with a transfer hook')
  .option('-n, --name <name>', 'Token name', 'Transfer Hook Token')
  .option('-d, --decimals <decimals>', 'Token decimals')
  .option('--transfer-hook-authority <pubkey>', 'Transfer hook authority')
  .option('--mint', 'Mint tokens after creation')
  .option('-a, --amount <amount>', 'Amount to mint', '1000')
  .action(async (options) => {
    try {
      const config = loadConfig();
      await createTransferHookToken(options, config);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program
  .command('create-group-pointer')
  .description('Create a token with a group pointer')
  .option('-n, --name <name>', 'Token name', 'Group Pointer Token')
  .option('-d, --decimals <decimals>', 'Token decimals')
  .option('--group-authority <pubkey>', 'Group authority')
  .option('--mint', 'Mint tokens after creation')
  .option('-a, --amount <amount>', 'Amount to mint', '1000')
  .action(async (options) => {
    try {
      const config = loadConfig();
      await createGroupPointerToken(options, config);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program
  .command('create-member-pointer')
  .description('Create a token with a member pointer')
  .option('-n, --name <name>', 'Token name', 'Member Pointer Token')
  .option('-d, --decimals <decimals>', 'Token decimals')
  .option('--member-authority <pubkey>', 'Member authority')
  .option('--mint', 'Mint tokens after creation')
  .option('-a, --amount <amount>', 'Amount to mint', '1000')
  .action(async (options) => {
    try {
      const config = loadConfig();
      await createMemberPointerToken(options, config);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program
  .command('create-default-account-state')
  .description('Create a token with a default account state')
  .option('-n, --name <name>', 'Token name', 'Default Account State Token')
  .option('-d, --decimals <decimals>', 'Token decimals')
  .option('--account-state <state>', 'Default account state (Frozen, Unfrozen, Uninitialized)', 'Frozen')
  .option('--mint', 'Mint tokens after creation')
  .option('-a, --amount <amount>', 'Amount to mint', '1000')
  .action(async (options) => {
    try {
      const config = loadConfig();
      await createDefaultAccountStateToken(options, config);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program
  .command('create-permanent-delegate')
  .description('Create a token with a permanent delegate')
  .option('-n, --name <name>', 'Token name', 'Permanent Delegate Token')
  .option('-d, --decimals <decimals>', 'Token decimals')
  .option('--permanent-delegate <pubkey>', 'Permanent delegate (public key)')
  .option('--mint', 'Mint tokens after creation')
  .option('-a, --amount <amount>', 'Amount to mint', '1000')
  .action(async (options) => {
    try {
      const config = loadConfig();
      await createPermanentDelegateToken(options, config);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program
  .command('create-metadata-pointer')
  .description('Create a token with a metadata pointer')
  .option('-n, --name <n>', 'Token name', 'Metadata Pointer Token')
  .option('-d, --decimals <decimals>', 'Token decimals')
  .option('--metadata-authority <pubkey>', 'Metadata authority (public key)')
  .option('--mint', 'Mint tokens after creation')
  .option('-a, --amount <amount>', 'Amount to mint', '1000')
  .action(async (options) => {
    try {
      const config = loadConfig();
      await createMetadataPointerToken(options, config);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program
  .command('create-full-metadata')
  .description('Create a token with complete metadata (name, symbol, description, image)')
  .option('-n, --name <name>', 'Token name', 'Custom Token')
  .option('-s, --symbol <symbol>', 'Token symbol', 'CTK')
  .option('--token-name <tokenName>', 'Full token name (displayed name)')
  .option('--description <description>', 'Token description')
  .option('--image <url>', 'Token image URL')
  .option('--external-url <url>', 'External website URL')
  .option('--uri <uri>', 'Custom metadata URI (overrides auto-generated)')
  .option('-d, --decimals <decimals>', 'Token decimals')
  .option('--update-authority <pubkey>', 'Metadata update authority')
  .option('--mint', 'Mint tokens after creation')
  .option('-a, --amount <amount>', 'Amount to mint', '1000')
  .action(async (options) => {
    try {
      const config = loadConfig();
      await createFullMetadataToken(options, config);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program
  .command('create-multi-extension')
  .description('Create a token with multiple extensions')
  .option('-n, --name <n>', 'Token name', 'Multi-Extension Token')
  .option('-d, --decimals <decimals>', 'Token decimals')
  .option('--transfer-fee', 'Include Transfer Fee Config')
  .option('--fee-basis-points <points>', 'Transfer fee basis points (default: 100)', '100')
  .option('--max-fee <amount>', 'Maximum transfer fee in tokens (default: 1)', '1')
  .option('--interest-bearing', 'Include Interest Bearing Config')
  .option('--rate <rate>', 'Interest rate percentage (default: 5)', '5')
  .option('--non-transferable', 'Include Non-Transferable')
  .option('--closeable', 'Include Mint Close Authority')
  .option('--default-account-state', 'Include Default Account State')
  .option('--account-state <state>', 'Default account state (Initialized, Frozen)', 'Initialized')
  .option('--freeze-authority <pubkey>', 'Freeze authority (required with Default Account State)')
  .option('--permanent-delegate', 'Include Permanent Delegate')
  .option('--permanent-delegate-key <pubkey>', 'Permanent delegate (public key)')
  .option('--metadata-pointer', 'Include Metadata Pointer')
  .option('--metadata-authority <pubkey>', 'Metadata authority (public key)')
  .option('--full-metadata', 'Include full metadata (name, symbol, description)')
  .option('-s, --symbol <symbol>', 'Token symbol (for metadata)')
  .option('--token-name <tokenName>', 'Full token name (for metadata)')
  .option('--description <description>', 'Token description (for metadata)')
  .option('--image <url>', 'Token image URL (for metadata)')
  .option('--external-url <url>', 'External website URL (for metadata)')
  .option('--mint', 'Mint tokens after creation')
  .option('-a, --amount <amount>', 'Amount to mint', '1000')
  .action(async (options) => {
    try {
      const config = loadConfig();
      await createMultiExtensionToken(options, config);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program
  .command('create-scaled-ui-amount')
  .description('Create a token with scaled UI amount')
  .option('-n, --name <name>', 'Token name', 'Scaled UI Amount Token')
  .option('-d, --decimals <decimals>', 'Token decimals')
  .option('--scale-factor <factor>', 'Scale factor for UI amount (e.g., 1000 for 1000x scaling)')
  .option('--mint', 'Mint tokens after creation')
  .option('-a, --amount <amount>', 'Amount to mint', '1000')
  .action(async (options) => {
    try {
      const config = loadConfig();
      await createScaledUIAmountToken(options, config);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program
  .command('interactive')
  .description('Interactive token creation wizard')
  .action(async () => {
    console.log(chalk.blue('Token-2022 Extension Wizard'));
    console.log(chalk.gray('Create your custom token step by step...\n'));
    
    const config = loadConfig();
    
    // Check if wallet exists
    if (!fs.existsSync(config.walletPath)) {
      console.log(chalk.yellow('No wallet found. Please run setup first:'));
      console.log(chalk.gray('token-extensions-cli setup'));
      return;
    }
    
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'tokenType',
        message: 'What type of token do you want to create?',
        choices: [
          { name: 'Transfer Fee Token - Collect fees on transfers', value: 'transfer-fee' },
          { name: 'Interest-Bearing Token - Tokens that earn interest', value: 'interest-bearing' },
          { name: 'Soulbound Token - Non-transferable tokens', value: 'soulbound' },
          { name: 'Closeable Token - Can be closed to reclaim rent', value: 'closeable' },
          { name: 'Default Account State Token - Sets default account state', value: 'default-account-state' },
          { name: 'Permanent Delegate Token - Sets permanent delegate', value: 'permanent-delegate' },
          { name: 'Metadata Pointer Token - Sets metadata pointer', value: 'metadata-pointer' },
          { name: 'Transfer Hook Token - Custom program execution on transfers', value: 'transfer-hook' },
          { name: 'Group Pointer Token - Points to group membership data', value: 'group-pointer' },
          { name: 'Member Pointer Token - Points to member data', value: 'member-pointer' },
          { name: 'Multi-Extension Token - Combine multiple extensions', value: 'multi-extension' },
          { name: 'Scaled UI Amount Token - Custom UI scaling', value: 'scaled-ui-amount' },
        ]
      }
    ]);
    
    // Get basic token details
    const tokenDetails = await promptForTokenDetails({
      decimals: config.defaultDecimals,
      amount: config.defaultAmount
    });
    
    Object.assign(answers, tokenDetails);
    
    if (answers.tokenType === 'transfer-fee') {
      console.log(chalk.blue('\n Transfer Fee Configuration'));
      console.log(chalk.gray('Configure how fees are collected on transfers...\n'));
      
      const feeAnswers = await promptForTransferFeeDetails();
      Object.assign(answers, feeAnswers);
    }
    
    if (answers.tokenType === 'interest-bearing') {
      console.log(chalk.blue('\n Interest-Bearing Configuration'));
      console.log(chalk.gray('Configure how interest accrues on your tokens...\n'));
      
      const interestAnswers = await promptForInterestBearingDetails();
      Object.assign(answers, interestAnswers);
    }

    if (answers.tokenType === 'closeable') {
      const closeableAnswers = await inquirer.prompt([
        {
          type: 'input',
          name: 'closeAuthority',
          message: 'Close authority (public key):',
          validate: (input) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input) || 'Invalid public key'
        }
      ]);
      Object.assign(answers, closeableAnswers);
    }

    if (answers.tokenType === 'frozen') {
      const frozenAnswers = await inquirer.prompt([
        {
          type: 'input',
          name: 'immutableOwner',
          message: 'Immutable owner (public key):',
          validate: (input) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input) || 'Invalid public key'
        }
      ]);
      Object.assign(answers, frozenAnswers);
    }

    if (answers.tokenType === 'required-memo-transfers') {
      const requiredMemoAnswers = await inquirer.prompt([
        {
          type: 'input',
          name: 'memoAuthority',
          message: 'Memo authority (public key):',
          validate: (input) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input) || 'Invalid public key'
        }
      ]);
      Object.assign(answers, requiredMemoAnswers);
    }

    if (answers.tokenType === 'cpi-guard') {
      const cpiGuardAnswers = await inquirer.prompt([
        {
          type: 'input',
          name: 'cpiGuardAuthority',
          message: 'CPI guard authority (public key):',
          validate: (input) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input) || 'Invalid public key'
        }
      ]);
      Object.assign(answers, cpiGuardAnswers);
    }

    if (answers.tokenType === 'transfer-hook') {
      const transferHookAnswers = await inquirer.prompt([
        {
          type: 'input',
          name: 'transferHookAuthority',
          message: 'Transfer hook authority (public key):',
          validate: (input) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input) || 'Invalid public key'
        }
      ]);
      Object.assign(answers, transferHookAnswers);
    }

    if (answers.tokenType === 'group-pointer') {
      const groupPointerAnswers = await inquirer.prompt([
        {
          type: 'input',
          name: 'groupAuthority',
          message: 'Group authority (public key):',
          validate: (input) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input) || 'Invalid public key'
        }
      ]);
      Object.assign(answers, groupPointerAnswers);
    }

    if (answers.tokenType === 'member-pointer') {
      const memberPointerAnswers = await inquirer.prompt([
        {
          type: 'input',
          name: 'memberAuthority',
          message: 'Member authority (public key):',
          validate: (input) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input) || 'Invalid public key'
        }
      ]);
      Object.assign(answers, memberPointerAnswers);
    }

    if (answers.tokenType === 'default-account-state') {
      const defaultAccountStateAnswers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'defaultAccountState',
          message: 'Include Default Account State',
          default: false
        },
        {
          type: 'list',
          name: 'accountState',
          message: 'Default account state:',
          choices: [
            { name: 'Initialized (recommended for minting)', value: AccountState.Initialized },
            { name: 'Frozen', value: AccountState.Frozen },
          ],
          default: AccountState.Initialized,
          when: (answers) => answers.defaultAccountState
        },
        {
          type: 'input',
          name: 'freezeAuthority',
          message: 'Freeze authority (public key, required for Default Account State):',
          validate: (input) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input) || 'Invalid public key',
          when: (answers) => answers.defaultAccountState
        }
      ]);
      Object.assign(answers, defaultAccountStateAnswers);
    }

    if (answers.tokenType === 'permanent-delegate') {
      const permanentDelegateAnswers = await inquirer.prompt([
        {
          type: 'input',
          name: 'permanentDelegate',
          message: 'Permanent delegate (public key):',
          validate: (input) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input) || 'Invalid public key'
        }
      ]);
      Object.assign(answers, permanentDelegateAnswers);
    }

    if (answers.tokenType === 'metadata-pointer') {
      const metadataPointerAnswers = await inquirer.prompt([
        {
          type: 'input',
          name: 'metadataAuthority',
          message: 'Metadata authority (public key):',
          validate: (input) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input) || 'Invalid public key'
        }
      ]);
      Object.assign(answers, metadataPointerAnswers);
    }

    if (answers.tokenType === 'multi-extension') {
      console.log(chalk.blue('\nMulti-Extension Configuration'));
      console.log(chalk.gray('Select which extensions to combine in your token...\n'));
      
      const multiExtensionAnswers = await promptForMultiExtensionDetails();
      
      // Handle additional configuration for selected extensions
      const additionalConfig = {};
      
      if (multiExtensionAnswers.extensions.includes('transfer-fee')) {
        console.log(chalk.blue('\nTransfer Fee Settings'));
        const feeConfig = await promptForTransferFeeDetails();
        Object.assign(additionalConfig, feeConfig);
      }
      
      if (multiExtensionAnswers.extensions.includes('interest-bearing')) {
        console.log(chalk.blue('\nInterest-Bearing Settings'));
        const interestConfig = await promptForInterestBearingDetails();
        Object.assign(additionalConfig, interestConfig);
      }
      
      if (multiExtensionAnswers.extensions.includes('closeable')) {
        const closeableConfig = await inquirer.prompt([
          {
            type: 'input',
            name: 'closeAuthority',
            message: 'Close authority (public key, optional):',
            validate: (input) => !input || validatePublicKey(input) || 'Invalid public key format'
          }
        ]);
        Object.assign(additionalConfig, closeableConfig);
      }
      
      if (multiExtensionAnswers.extensions.includes('default-account-state')) {
        const accountStateConfig = await inquirer.prompt([
          {
            type: 'list',
            name: 'accountState',
            message: 'Default account state:',
            choices: [
              { name: 'Initialized (recommended for minting)', value: AccountState.Initialized },
              { name: 'Frozen', value: AccountState.Frozen },
            ],
            default: AccountState.Initialized
          },
          {
            type: 'input',
            name: 'freezeAuthority',
            message: 'Freeze authority (public key, required):',
            validate: (input) => validatePublicKey(input) || 'Invalid public key format'
          }
        ]);
        Object.assign(additionalConfig, accountStateConfig);
      }
      
      if (multiExtensionAnswers.extensions.includes('permanent-delegate')) {
        const delegateConfig = await inquirer.prompt([
          {
            type: 'input',
            name: 'permanentDelegateKey',
            message: 'Permanent delegate (public key):',
            validate: (input) => validatePublicKey(input) || 'Invalid public key format'
          }
        ]);
        Object.assign(additionalConfig, delegateConfig);
      }
      
      if (multiExtensionAnswers.extensions.includes('metadata-pointer')) {
        const metadataConfig = await inquirer.prompt([
          {
            type: 'input',
            name: 'metadataAuthority',
            message: 'Metadata authority (public key):',
            validate: (input) => validatePublicKey(input) || 'Invalid public key format'
          }
        ]);
        Object.assign(additionalConfig, metadataConfig);
      }
      
      // Convert extension names to boolean flags
      additionalConfig.transferFee = multiExtensionAnswers.extensions.includes('transfer-fee');
      additionalConfig.interestBearing = multiExtensionAnswers.extensions.includes('interest-bearing');
      additionalConfig.nonTransferable = multiExtensionAnswers.extensions.includes('non-transferable');
      additionalConfig.closeable = multiExtensionAnswers.extensions.includes('closeable');
      additionalConfig.defaultAccountState = multiExtensionAnswers.extensions.includes('default-account-state');
      additionalConfig.permanentDelegate = multiExtensionAnswers.extensions.includes('permanent-delegate');
      additionalConfig.metadataPointer = multiExtensionAnswers.extensions.includes('metadata-pointer');
      
      Object.assign(answers, additionalConfig);
    }

    if (answers.tokenType === 'scaled-ui-amount') {
      const scaledUIAmountAnswers = await inquirer.prompt([
        {
          type: 'number',
          name: 'scaleFactor',
          message: 'Scale factor for UI amount (e.g., 1000 for 1000x scaling):',
          default: 1,
          validate: (input) => input > 0
        }
      ]);
      Object.assign(answers, scaledUIAmountAnswers);
    }
    
    try {
      const config = loadConfig();
      const options = {
        ...answers,
        mint: answers.mintTokens
      };
      
      switch (answers.tokenType) {
        case 'transfer-fee':
          await createTransferFeeToken(options, config);
          break;
        case 'interest-bearing':
          await createInterestBearingToken(options, config);
          break;
        case 'soulbound':
          await createSoulboundToken(options, config);
          break;
        case 'closeable':
          await createCloseableToken(options, config);
          break;
        case 'frozen':
          await createFrozenDefaultToken(options, config);
          break;
        case 'required-memo-transfers':
          await createRequiredMemoTransfersToken(options, config);
          break;
        case 'cpi-guard':
          await createCpiGuardToken(options, config);
          break;
        case 'transfer-hook':
          await createTransferHookToken(options, config);
          break;
        case 'group-pointer':
          await createGroupPointerToken(options, config);
          break;
        case 'member-pointer':
          await createMemberPointerToken(options, config);
          break;
        case 'default-account-state':
          await createDefaultAccountStateToken(options, config);
          break;
        case 'permanent-delegate':
          await createPermanentDelegateToken(options, config);
          break;
        case 'metadata-pointer':
          await createMetadataPointerToken(options, config);
          break;
        case 'multi-extension':
          await createMultiExtensionToken(options, config);
          break;
        case 'scaled-ui-amount':
          await createScaledUIAmountToken(options, config);
          break;
        default:
          console.log(chalk.yellow('Token type not yet implemented in interactive mode.'));
          console.log(chalk.gray('Use the specific commands instead.'));
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program
  .command('list')
  .description('List created tokens')
  .option('-t, --type <type>', 'Filter by token type')
  .action((options) => {
    const config = loadConfig();
    
    if (!fs.existsSync(config.outputDir)) {
      console.log(chalk.yellow('No tokens found.'));
      return;
    }
    
    const files = fs.readdirSync(config.outputDir)
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const tokenInfo = JSON.parse(fs.readFileSync(path.join(config.outputDir, file), 'utf8'));
        return { file, ...tokenInfo };
      });
    
    const filteredTokens = options.type 
      ? files.filter(token => token.type === options.type)
      : files;
    
    if (filteredTokens.length === 0) {
      console.log(chalk.yellow('No tokens found.'));
      return;
    }
    
    console.log(chalk.blue(`Found ${filteredTokens.length} token(s):\n`));
    
    filteredTokens.forEach((token, index) => {
      console.log(chalk.cyan(`${index + 1}. ${token.name}`));
      console.log(chalk.gray(`   Type: ${token.type}`));
      console.log(chalk.gray(`   Mint: ${token.mint}`));
      console.log(chalk.gray(`   Network: ${token.network}`));
      console.log(chalk.gray(`   Created: ${new Date(token.createdAt).toLocaleDateString()}`));
      console.log();
    });
  });

program
  .command('validate')
  .description('Validate current configuration and test connection')
  .action(async () => {
    console.log(chalk.blue('Validating Configuration...\n'));
    
    const config = loadConfig();
    
    // Check configuration
    console.log(chalk.cyan('Configuration:'));
    console.log(chalk.gray(`  Network: ${config.network}`));
    console.log(chalk.gray(`  RPC URL: ${config.rpcUrl}`));
    console.log(chalk.gray(`  Wallet Path: ${config.walletPath}`));
    console.log(chalk.gray(`  Output Directory: ${config.outputDir}`));
    console.log(chalk.gray(`  Default Decimals: ${config.defaultDecimals}`));
    console.log(chalk.gray(`  Default Fee Basis Points: ${config.defaultFeeBasisPoints}`));
    console.log(chalk.gray(`  Default Max Fee: ${config.defaultMaxFee}`));
    console.log(chalk.gray(`  Default Interest Rate: ${config.defaultInterestRate}`));
    console.log(chalk.gray(`  Default Amount: ${config.defaultAmount}`));
    console.log(chalk.gray(`  Confirm Transactions: ${config.confirmTransactions}`));
    console.log(chalk.gray(`  Save Token Info: ${config.saveTokenInfo}`));
    console.log(chalk.gray(`  Show Detailed Output: ${config.showDetailedOutput}`));
    
    // Validate wallet
    console.log(chalk.cyan('\nWallet:'));
    if (fs.existsSync(config.walletPath)) {
      try {
        const wallet = loadWallet(config.walletPath);
        console.log(chalk.green(`  Wallet loaded: ${wallet.publicKey.toBase58()}`));
      } catch (error) {
        console.log(chalk.red(`  Wallet error: ${error.message}`));
      }
    } else {
              console.log(chalk.red(`  Wallet not found: ${config.walletPath}`));
    }
    
    // Test connection
    console.log(chalk.cyan('\nConnection:'));
    try {
      const connection = await getConnection(config.rpcUrl);
      const version = await connection.getVersion();
              console.log(chalk.green(`  Connected to ${config.network}`));
      console.log(chalk.gray(`  Solana version: ${version['solana-core']}`));
      
      // Check balance if wallet exists
      if (fs.existsSync(config.walletPath)) {
        try {
          const wallet = loadWallet(config.walletPath);
          const balance = await connection.getBalance(wallet.publicKey);
          console.log(chalk.gray(`  Wallet balance: ${balance / 1e9} SOL`));
          
          if (balance < 0.01 * 1e9) {
            console.log(chalk.yellow(`  Low balance. Consider airdropping: solana airdrop 2`));
          }
        } catch (error) {
          console.log(chalk.yellow(`  Could not check balance: ${error.message}`));
        }
      }
    } catch (error) {
              console.log(chalk.red(`  Connection failed: ${error.message}`));
    }
    
    // Check output directory
    console.log(chalk.cyan('\nOutput Directory:'));
    try {
      ensureOutputDir(config.outputDir);
              console.log(chalk.green(`  Output directory ready: ${config.outputDir}`));
    } catch (error) {
              console.log(chalk.red(`  Output directory error: ${error.message}`));
    }
    
    console.log(chalk.blue('\nValidation complete!'));
  });

program
  .command('examples')
  .description('Show usage examples')
  .action(() => {
    console.log(chalk.blue('Token Extensions CLI Examples\n'));
    
    console.log(chalk.yellow('Configuration:'));
    console.log('  token-extensions-cli config --network devnet --wallet-path ./my-wallet.json');
    console.log('  token-extensions-cli config --show\n');
    
    console.log(chalk.yellow('Create Transfer Fee Token:'));
    console.log('  token-extensions-cli create-transfer-fee --name "DeFi Token" --fee-basis-points 50 --mint --amount 10000\n');
    
    console.log(chalk.yellow('Create Interest-Bearing Token:'));
    console.log('  token-extensions-cli create-interest-bearing --name "Savings Token" --rate 750 --mint --amount 5000\n');
    
    console.log(chalk.yellow('Create Soulbound Token:'));
    console.log('  token-extensions-cli create-soulbound --name "Achievement Badge" --mint --amount 1\n');
    
    console.log(chalk.yellow('Create Closeable Token:'));
    console.log('  token-extensions-cli create-closeable --name "Access Pass" --close-authority 0x123... --mint --amount 1000\n');

    console.log(chalk.yellow('Create Frozen Default Token:'));
    console.log('  token-extensions-cli create-frozen --name "Immutable Token" --immutable-owner 0x456... --mint --amount 1000\n');

    console.log(chalk.yellow('Create Required Memo Transfers Token:'));
    console.log('  token-extensions-cli create-required-memo-transfers --name "Memo Token" --memo-authority 0x789... --mint --amount 1000\n');

    console.log(chalk.yellow('Create CPI Guard Token:'));
    console.log('  token-extensions-cli create-cpi-guard --name "CPI Token" --cpi-guard-authority 0xabc... --mint --amount 1000\n');

    console.log(chalk.yellow('Create Transfer Hook Token:'));
    console.log('  token-extensions-cli create-transfer-hook --name "Hook Token" --transfer-hook-authority 0xdef... --mint --amount 1000\n');

    console.log(chalk.yellow('Create Group Pointer Token:'));
    console.log('  token-extensions-cli create-group-pointer --name "Group Token" --group-authority 0x112... --mint --amount 1000\n');

    console.log(chalk.yellow('Create Member Pointer Token:'));
    console.log('  token-extensions-cli create-member-pointer --name "Member Token" --member-authority 0x223... --mint --amount 1000\n');

    console.log(chalk.yellow('Create Default Account State Token:'));
    console.log('  token-extensions-cli create-default-account-state --name "State Token" --account-state Frozen --mint --amount 1000\n');

    console.log(chalk.yellow('Create Permanent Delegate Token:'));
    console.log('  token-extensions-cli create-permanent-delegate --name "Delegate Token" --permanent-delegate 0x334... --mint --amount 1000\n');

    console.log(chalk.yellow('Create Metadata Pointer Token:'));
    console.log('  token-extensions-cli create-metadata-pointer --name "Pointer Token" --metadata-authority 0x445... --mint --amount 1000\n');

    console.log(chalk.yellow('Create Multi-Extension Token:'));
    console.log('  token-extensions-cli create-multi-extension --name "Multi-Extension Token" --transfer-fee --interest-bearing --mint --amount 10000\n');

    console.log(chalk.yellow('Create Scaled UI Amount Token:'));
    console.log('  token-extensions-cli create-scaled-ui-amount --name "Scaled Token" --scale-factor 1000 --mint --amount 10000\n');
    
    console.log(chalk.yellow('Interactive Mode:'));
    console.log('  token-extensions-cli interactive\n');
    
    console.log(chalk.yellow('List Tokens:'));
    console.log('  token-extensions-cli list');
    console.log('  token-extensions-cli list --type transfer-fee\n');
  });

program.parse();

if (!process.argv.slice(2).length) {
  program.outputHelp();
} 