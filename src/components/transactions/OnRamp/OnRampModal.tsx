import { PERMISSION } from '@aave/contract-helpers';
import { Trans } from '@lingui/macro';
import React from 'react';
import { ModalContextType, ModalType, useModalContext } from 'src/hooks/useModal';

import { BasicModal } from '../../primitives/BasicModal';
import { ModalWrapper } from '../FlowCommons/ModalWrapper';
import { OnRampModalContent } from './OnRampModalContent';

export const OnRampModal = () => {
  const { type, close, args } = useModalContext() as ModalContextType<{
    underlyingAsset: string;
  }>;

  return (
    <BasicModal open={type === ModalType.OnRamp} setOpen={close}>
      <ModalWrapper
        title={<Trans>On-ramp</Trans>}
        underlyingAsset={args.underlyingAsset}
        requiredPermission={PERMISSION.DEPOSITOR}
      >
        {(params) => <OnRampModalContent {...params} />}
      </ModalWrapper>
    </BasicModal>
  );
};
