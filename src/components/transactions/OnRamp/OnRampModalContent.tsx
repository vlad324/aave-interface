import { API_ETH_MOCK_ADDRESS } from '@aave/contract-helpers';
import { USD_DECIMALS, valueToBigNumber } from '@aave/math-utils';
import { Trans } from '@lingui/macro';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import BigNumber from 'bignumber.js';
import React, { useRef, useState } from 'react';
import { useModalContext } from 'src/hooks/useModal';
import { useProtocolDataContext } from 'src/hooks/useProtocolDataContext';
import { ERC20TokenType } from 'src/libs/web3-data-provider/Web3Provider';
import { getMaxAmountAvailableToSupply } from 'src/utils/getMaxAmountAvailableToSupply';
import { useAppDataContext } from '../../../hooks/app-data-provider/useAppDataProvider';
import { CapType } from '../../caps/helper';
import { AssetInput } from '../AssetInput';
import { GasEstimationError } from '../FlowCommons/GasEstimationError';
import { ModalWrapperProps } from '../FlowCommons/ModalWrapper';
import { TxSuccessView } from '../FlowCommons/Success';
import { ethers } from 'ethers';
import { useWeb3Context } from '../../../libs/hooks/useWeb3Context';

export enum ErrorType {
  CAP_REACHED,
}

type InitiateOnRampResponse = {
  id: string;
  redirectUrl: string;
};

type PaymentStatus = {
  id: string;
  status: string;
};

export const OnRampModalContent = ({
  underlyingAsset,
  poolReserve,
  nativeBalance,
  tokenBalance,
}: ModalWrapperProps) => {
  const { marketReferencePriceInUsd } = useAppDataContext();
  const { currentNetworkConfig } = useProtocolDataContext();
  const { mainTxState: supplyTxState, txError } = useModalContext();
  const { currentAccount } = useWeb3Context();

  // states
  const [_amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const amountRef = useRef<string>();
  const supplyUnWrapped = underlyingAsset.toLowerCase() === API_ETH_MOCK_ADDRESS.toLowerCase();

  const walletBalance = supplyUnWrapped ? nativeBalance : tokenBalance;

  // Calculate max amount to supply
  const maxAmountToSupply = getMaxAmountAvailableToSupply(
    '10000000000000000000000000000000',
    poolReserve,
    underlyingAsset
  );
  const isMaxSelected = _amount === '-1';
  const amount = isMaxSelected ? maxAmountToSupply.toString(10) : _amount;

  const handleChange = (value: string) => {
    const maxSelected = value === '-1';
    amountRef.current = maxSelected ? maxAmountToSupply.toString(10) : value;
    setAmount(value);
  };

  // Calculation of future HF
  const amountIntEth = new BigNumber(amount).multipliedBy(
    poolReserve.formattedPriceInMarketReferenceCurrency
  );
  // TODO: is it correct to ut to -1 if user doesnt exist?
  const amountInUsd = amountIntEth.multipliedBy(marketReferencePriceInUsd).shiftedBy(-USD_DECIMALS);

  // ************** Warnings **********
  // isolation warning

  // TODO: check if calc is correct to see if cap reached
  const capReached =
    poolReserve.supplyCap !== '0' &&
    valueToBigNumber(amount).gt(
      new BigNumber(poolReserve.supplyCap).minus(poolReserve.totalLiquidity)
    );

  // handle error for supply cap reached
  let blockingError: ErrorType | undefined = undefined;
  if (!supplyTxState.success) {
    if (capReached) {
      blockingError = ErrorType.CAP_REACHED;
    }
  }
  const handleBlocked = () => {
    switch (blockingError) {
      case ErrorType.CAP_REACHED:
        return <Trans>Cap reached. Lower supply amount</Trans>;
      default:
        return null;
    }
  };

  // token info to add to wallet
  const addToken: ERC20TokenType = {
    address: poolReserve.aTokenAddress,
    symbol: poolReserve.iconSymbol,
    decimals: poolReserve.decimals,
    aToken: true,
  };

  const handleOnRamp = async () => {
    if (!window) {
      console.log('window', window);
    }

    const snapId = 'local:http://localhost:8080';
    await ethereum.request({
      method: 'wallet_enable',
      params: [
        {
          wallet_snap: { [snapId]: {} },
        },
      ],
    });

    let asset = addToken.symbol;
    if (asset === 'WMATIC') {
      asset = 'MATIC';
    }

    const response = (await ethereum.request({
      method: 'wallet_invokeSnap',
      params: [
        snapId,
        {
          method: 'initiateOnRamp',
          amount: ethers.utils.parseEther(_amount).toString(),
          asset: asset,
          walletAddress: currentAccount,
        },
      ],
    })) as InitiateOnRampResponse;

    window.open(response.redirectUrl, '_blank')!.focus();
    setLoading(true);

    setInterval(async () => {
      const paymentStatus = (await ethereum.request({
        method: 'wallet_invokeSnap',
        params: [
          snapId,
          {
            method: 'queryStatus',
            paymentId: response.id,
          },
        ],
      })) as PaymentStatus;

      console.log(paymentStatus);

      if (paymentStatus.status === 'RELEASED') {
        setLoading(false);
        setSuccess(true);
      }
    }, 5000);
  };

  if (supplyTxState.success)
    return (
      <TxSuccessView
        action={<Trans>Supplied</Trans>}
        amount={amountRef.current}
        symbol={supplyUnWrapped ? currentNetworkConfig.baseAssetSymbol : poolReserve.symbol}
        addToken={addToken}
      />
    );

  return (
    <>
      <AssetInput
        value={amount}
        onChange={handleChange}
        usdValue={amountInUsd.toString(10)}
        symbol={supplyUnWrapped ? currentNetworkConfig.baseAssetSymbol : poolReserve.symbol}
        assets={[
          {
            balance: walletBalance,
            symbol: supplyUnWrapped ? currentNetworkConfig.baseAssetSymbol : poolReserve.symbol,
            iconSymbol: supplyUnWrapped
              ? currentNetworkConfig.baseAssetSymbol
              : poolReserve.iconSymbol,
          },
        ]}
        capType={CapType.supplyCap}
        isMaxSelected={isMaxSelected}
        disabled={supplyTxState.loading}
        maxValue={maxAmountToSupply.toString(10)}
      />

      {blockingError !== undefined && (
        <Typography variant="helperText" color="error.main">
          {handleBlocked()}
        </Typography>
      )}

      {txError && <GasEstimationError txError={txError} />}

      <Box sx={{ display: 'flex', flexDirection: 'column', mt: 12 }}>
        <Button
          variant="contained"
          disabled={!amount || success}
          onClick={() => handleOnRamp()}
          size="large"
          sx={{ minHeight: '44px' }}
          data-cy="approvalButton"
        >
          {loading ? (
            <CircularProgress color="inherit" size="16px" sx={{ mr: 2 }} />
          ) : success ? (
            'Success'
          ) : (
            'On-ramp'
          )}
        </Button>
      </Box>
    </>
  );
};
