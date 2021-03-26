//SPDX-License-Identifier: MIT
pragma solidity 0.6.8;

interface IExchange {
	function sell(uint256, uint256, bool) external returns (uint256);
}
