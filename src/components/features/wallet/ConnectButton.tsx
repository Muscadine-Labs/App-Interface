'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';

interface ConnectButtonProps {
    centerContent?: boolean;
}

export default function ConnectButtonComponent({}: ConnectButtonProps) {
    return (
        <ConnectButton
            label="Connect Wallet"
            accountStatus={{
                smallScreen: 'avatar',
                largeScreen: 'full',
            }}
            chainStatus={{
                smallScreen: 'icon',
                largeScreen: 'full',
            }}
            showBalance={{
                smallScreen: false,
                largeScreen: true,
            }}
        />
    );
}