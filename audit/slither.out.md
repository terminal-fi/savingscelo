```
> slither .
```

Output with comments classifying benign/not-applicable issues.

```
# NOTE(zviadm): Not dangerous comparisons, since these are meant to be exact checks deliberately.

INFO:Detectors:
SavingsCELO.savingsToMint(uint256,uint256,uint256) (SavingsCELO.sol#323-334) uses a dangerous strict equality:
        - totalSavingsCELO == 0 || totalCELO == 0 (SavingsCELO.sol#327)
SavingsCELO.withdrawStart(uint256,address,address,address,address) (SavingsCELO.sol#160-199) uses a dangerous strict equality:
        - assert(bool)(pendingValue == toUnlock) (SavingsCELO.sol#196)
Reference: https://github.com/crytic/slither/wiki/Detector-Documentation#dangerous-strict-equalities
```

```
# NOTE(zviadm): Zero values are valid values in all these cases. And they are safe since the owner
# can change them again.

INFO:Detectors:
SavingsCELOVGroup.constructor(address).savingsCELO (SavingsCELOVGroup.sol#31) lacks a zero-check on :
                - _savingsCELO = savingsCELO (SavingsCELOVGroup.sol#32)
SavingsCELO.authorizeVoterProxy(address).proxy (SavingsCELO.sol#70) lacks a zero-check on :
                - _voter = proxy (SavingsCELO.sol#72)
SavingsCELOVoterV1.changeVotedGroup(address,uint256,address,address,address,address).newGroup (SavingsCELOVoterV1.sol#41) lacks a zero-check on :
                - votedGroup = newGroup (SavingsCELOVoterV1.sol#63)
Reference: https://github.com/crytic/slither/wiki/Detector-Documentation#missing-zero-address-validation
```

```
# NOTE(zviadm): These are just `address` constants. Not sure if there is any other way to define
# them than this.

Reference: https://github.com/crytic/slither/wiki/Detector-Documentation#redundant-statements
INFO:Detectors:
SavingsCELOVGroup.slitherConstructorConstantVariables() (SavingsCELOVGroup.sol#17-107) uses literals with too many digits:
        - _registry = IRegistry(address(0x000000000000000000000000000000000000ce10)) (SavingsCELOVGroup.sol#24)
SavingsCELO.slitherConstructorConstantVariables() (SavingsCELO.sol#16-337) uses literals with too many digits:
        - _registry = IRegistry(address(0x000000000000000000000000000000000000ce10)) (SavingsCELO.sol#23)
SavingsCELOVoterV1.slitherConstructorConstantVariables() (SavingsCELOVoterV1.sol#14-95) uses literals with too many digits:
        - _registry = IRegistry(address(0x000000000000000000000000000000000000ce10)) (SavingsCELOVoterV1.sol#20)
```

```
# NOTE(zviadm): Re-entrancy issues are all grouped here. Re-entrancy bugs don't apply to SavingsCELO
# since it is only calling out to Core Celo contracts that have their own re-entrancy guards anyways.
# Adding another layer of re-entrancy checks would just use up extra gas for no real benefit.

INFO:Detectors:
Reentrancy in SavingsCELOVoterV1.changeVotedGroup(address,uint256,address,address,address,address) (SavingsCELOVoterV1.sol#40-64):
        External calls:
        - require(bool,string)(_proxy.proxyRevokePending(votedGroup,pendingVotes,lesserAfterPendingRevoke,greaterAfterPendingRevoke,votedGroupIndex),revokePending for voted group failed) (SavingsCELOVoterV1.sol#51-54)
        - require(bool,string)(_proxy.proxyRevokeActive(votedGroup,activeVotes,lesserAfterActiveRevoke,greaterAfterActiveRevoke,votedGroupIndex),revokeActive for voted group failed) (SavingsCELOVoterV1.sol#57-60)
        State variables written after the call(s):
        - votedGroup = newGroup (SavingsCELOVoterV1.sol#63)
Reference: https://github.com/crytic/slither/wiki/Detector-Documentation#reentrancy-vulnerabilities-1

INFO:Detectors:
Reentrancy in SavingsCELO.deposit(uint256) (SavingsCELO.sol#132-146):
        External calls:
        - require(bool,string)(_goldToken.transferFrom(msg.sender,address(this),celoAmount),transfer of CELO failed) (SavingsCELO.sol#135-137)
        State variables written after the call(s):
        - _mint(msg.sender,toMint) (SavingsCELO.sol#139)
                - _balances[account] = _balances[account].add(amount) (@openzeppelin/contracts/token/ERC20/ERC20.sol#235)
        - _mint(msg.sender,toMint) (SavingsCELO.sol#139)
                - _totalSupply = _totalSupply.add(amount) (@openzeppelin/contracts/token/ERC20/ERC20.sol#234)
Reentrancy in SavingsCELO.withdrawCancel(uint256,uint256) (SavingsCELO.sol#256-264):
        External calls:
        - _lockedGold.relock(indexGlobal,pending.value) (SavingsCELO.sol#260)
        State variables written after the call(s):
        - _mint(msg.sender,toMint) (SavingsCELO.sol#262)
                - _balances[account] = _balances[account].add(amount) (@openzeppelin/contracts/token/ERC20/ERC20.sol#235)
        - _mint(msg.sender,toMint) (SavingsCELO.sol#262)
                - _totalSupply = _totalSupply.add(amount) (@openzeppelin/contracts/token/ERC20/ERC20.sol#234)
Reentrancy in SavingsCELO.withdrawStart(uint256,address,address,address,address) (SavingsCELO.sol#160-199):
        External calls:
        - _lockedGold.lock{value: unlocked}() (SavingsCELO.sol#176)
        - revokeVotes(toUnlock - nonvoting,lesserAfterPendingRevoke,greaterAfterPendingRevoke,lesserAfterActiveRevoke,greaterAfterActiveRevoke) (SavingsCELO.sol#183-189)
                - require(bool,string)(_election.revokePending(revokeGroup,toRevokePending,lesserAfterPendingRevoke,greaterAfterPendingRevoke,revokeIndex),revokePending failed) (SavingsCELO.sol#226-229)
                - require(bool,string)(_election.revokeActive(revokeGroup,toRevokeActive,lesserAfterActiveRevoke,greaterAfterActiveRevoke,revokeIndex),revokeActive failed) (SavingsCELO.sol#232-235)
        - _lockedGold.unlock(toUnlock) (SavingsCELO.sol#191)
        External calls sending eth:
        - _lockedGold.lock{value: unlocked}() (SavingsCELO.sol#176)
        State variables written after the call(s):
        - pendingByAddr[msg.sender].push(PendingWithdrawal(pendingValue,pendingTimestamp)) (SavingsCELO.sol#197)
Reference: https://github.com/crytic/slither/wiki/Detector-Documentation#reentrancy-vulnerabilities-2

INFO:Detectors:
Reentrancy in SavingsCELO.deposit(uint256) (SavingsCELO.sol#132-146):
        External calls:
        - require(bool,string)(_goldToken.transferFrom(msg.sender,address(this),celoAmount),transfer of CELO failed) (SavingsCELO.sol#135-137)
        Event emitted after the call(s):
        - Transfer(address(0),account,amount) (@openzeppelin/contracts/token/ERC20/ERC20.sol#236)
                - _mint(msg.sender,toMint) (SavingsCELO.sol#139)
Reentrancy in SavingsCELO.deposit(uint256) (SavingsCELO.sol#132-146):
        External calls:
        - require(bool,string)(_goldToken.transferFrom(msg.sender,address(this),celoAmount),transfer of CELO failed) (SavingsCELO.sol#135-137)
        - _lockedGold.lock{value: toLock}() (SavingsCELO.sol#144)
        External calls sending eth:
        - _lockedGold.lock{value: toLock}() (SavingsCELO.sol#144)
        Event emitted after the call(s):
        - Deposited(msg.sender,celoAmount,toMint) (SavingsCELO.sol#145)
Reentrancy in SavingsCELO.withdrawCancel(uint256,uint256) (SavingsCELO.sol#256-264):
        External calls:
        - _lockedGold.relock(indexGlobal,pending.value) (SavingsCELO.sol#260)
        Event emitted after the call(s):
        - Transfer(address(0),account,amount) (@openzeppelin/contracts/token/ERC20/ERC20.sol#236)
                - _mint(msg.sender,toMint) (SavingsCELO.sol#262)
        - WithdrawCanceled(msg.sender,pending.value,toMint) (SavingsCELO.sol#263)
Reentrancy in SavingsCELO.withdrawFinish(uint256,uint256) (SavingsCELO.sol#242-249):
        External calls:
        - _lockedGold.withdraw(indexGlobal) (SavingsCELO.sol#244)
        - require(bool,string)(_goldToken.transfer(msg.sender,pending.value),unexpected failure: CELO transfer has failed) (SavingsCELO.sol#245-247)
        Event emitted after the call(s):
        - WithdrawFinished(msg.sender,pending.value) (SavingsCELO.sol#248)
Reentrancy in SavingsCELO.withdrawStart(uint256,address,address,address,address) (SavingsCELO.sol#160-199):
        External calls:
        - _lockedGold.lock{value: unlocked}() (SavingsCELO.sol#176)
        - revokeVotes(toUnlock - nonvoting,lesserAfterPendingRevoke,greaterAfterPendingRevoke,lesserAfterActiveRevoke,greaterAfterActiveRevoke) (SavingsCELO.sol#183-189)
                - require(bool,string)(_election.revokePending(revokeGroup,toRevokePending,lesserAfterPendingRevoke,greaterAfterPendingRevoke,revokeIndex),revokePending failed) (SavingsCELO.sol#226-229)
                - require(bool,string)(_election.revokeActive(revokeGroup,toRevokeActive,lesserAfterActiveRevoke,greaterAfterActiveRevoke,revokeIndex),revokeActive failed) (SavingsCELO.sol#232-235)
        - _lockedGold.unlock(toUnlock) (SavingsCELO.sol#191)
        External calls sending eth:
        - _lockedGold.lock{value: unlocked}() (SavingsCELO.sol#176)
        Event emitted after the call(s):
        - WithdrawStarted(msg.sender,savingsAmount,pendingValue) (SavingsCELO.sol#198)
Reference: https://github.com/crytic/slither/wiki/Detector-Documentation#reentrancy-vulnerabilities-3
```

