# SavingsCELO

SavingsCELO is a fully fungible ERC-20 compliant representation for an interest bearing Locked CELO.

In human speak:
* User deposits CELO in SavingsCELO contract to receive SavingsCELO (sCELO) tokens.
* After some time passes, the user can return sCELO tokens to the SavingsCELO contract and receive more CELO back than they deposited.
* While deposits are instant, retrievals are delayed by the [unlocking period](https://docs.celo.org/celo-codebase/protocol/proof-of-stake/locked-gold#unlocking-period) (3 days).
* sCELO tokens can be transferred from one account to another without any restrictions and all
sCELO tokens in circulation are equivalent to each other.

# Smart Contract architecture

## SavingsCELO.sol

SavingsCELO is the primary contract that manages deposits and withdrawals and implements ERC20 standard for sCELO tokens.

SavingsCELO contract is un-upgradable, but it does have an admin/owner with extra priveleges:
* Owner can authorize a contract that can vote on behalf of the Locked CELO that is stored in the contract.
* Owner can also authorize a standard vote signer. This functionality exists mainly as an emergency hatch, in case
there is some backwards incompatible change in core Celo contracts that breaks regular proxy voting.
* Owner does not have any privileges to transfer out any of the CELO locked in the contract. However, malicious owner
could potentially block withdrawals through complex steps of continously creating new governance proposals and voting
for those proposals using CELO locked in the contract. Constant voting on these Governance proposals would essentially block
withdrawals.
* Final step for finalizing SavingsCELO project is to transfer its ownership to GovernanceProxy (i.e. regular Celo governance).

## SavingsCELOVoterV1.sol

SavingsCELOVoterV1 is the first version of the SavingsCELO voter contract. It supports voting for only one group at a time,
and does not support any governance voting.

Owner/admin of SavingsCELOVoterV1 is called the "Group Manager" and is responsible for choosing the group that
SavingsCELO votes for.
* By default, the voted group will be the deployed SavingsCELOVGroup contract.
* Group Manager can change the voted group in case of an emergency (i.e. if currently voted group gets slashed, or if there
is no longer enough CELO in the contract to keep the group elected)

## SavingsCELOVGroup.sol

SavingsCELOVGroup implements special type of validator group. Owner of this group is the same "Group Manager".

Group Manager has following priveleges:
* Can deposit/withdraw/lock/unlock CELO for the group.
* Can authorize a vote signer.
* Can authorize a validator signer to manage group members and its commission.

Group Manager doesn't have access to the cUSD rewards. cUSD rewards that accumulate on SavingsCELOVGroup can only be
converted to CELO and deposited back into SavingsCELO contract.

# Usage

You can interact with the SavingsCELO contracts using a command-line interface.
```
> npm install -g savingscelo@latest
> savingscli --help
```

SavingsCELO contracts are deployed on Baklava and Alfajores testnets too and `savingscli` supports interacting
with those out of the box. Example:
```
> savingscli -n https://baklava-forno.celo-testnet.org --ledger-idx 0 balance
```

# SDK - SavingsKit

`savingscelo` npm package comes with the typescript libraries that can be used to easily interact with the
SavingsCELO contracts. These libraries are based on @celo/contractkit. Checkout source
for `savingscli` tool for example usage: [src/cli.ts](./src/cli.ts)
