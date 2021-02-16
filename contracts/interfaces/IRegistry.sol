//SPDX-License-Identifier: MIT
pragma solidity 0.6.8;

interface IRegistry {
	function getAddressForStringOrDie(string calldata identifier) external view returns (address);
}
