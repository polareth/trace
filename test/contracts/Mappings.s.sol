// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.23;

contract Mappings {
    // Simple mapping
    mapping(address => uint256) private balances;
    
    // Nested mapping (with named keys)
    mapping(address owner => mapping(address spender => uint256 allowance)) private allowances;

    // Ridiculously nested mapping
    mapping(address => mapping(address => mapping(address => mapping(address => uint256)))) private ridiculouslyNestedMapping;
    
    // Mapping to a struct
    struct UserInfo {
        uint256 balance;
        uint256 lastUpdate;
        bool isActive;
    }
    mapping(address => UserInfo) private userInfo;

    // Mapping to an array
    mapping(uint256 => uint256[]) private purchases;

    function setBalance(address user, uint256 amount) public {
        balances[user] = amount;
    }

    function getBalance(address user) public view returns (uint256) {
        return balances[user];
    }

    function setAllowance(address owner, address spender, uint256 amount) public {
        allowances[owner][spender] = amount;
    }

    function setRidiculouslyNestedMapping(address a, address b, address c, address d, uint256 value) public {
        ridiculouslyNestedMapping[a][b][c][d] = value;
    }

    function setArrayMapping(uint256 index, uint256 value) public {
        purchases[index].push(value);
    }

    function getAllowance(address owner, address spender) public view returns (uint256) {
        return allowances[owner][spender];
    }

    function getRidiculouslyNestedMapping(address a, address b, address c, address d) public view returns (uint256) {
        return ridiculouslyNestedMapping[a][b][c][d];
    }

    function setUserInfo(address user, uint256 balance, uint256 lastUpdate, bool isActive) public {
        userInfo[user] = UserInfo(balance, lastUpdate, isActive);
    }

    function getUserInfo(address user) public view returns (UserInfo memory) {
        return userInfo[user];
    }

    function getArrayMapping(uint256 index) public view returns (uint256[] memory) {
        return purchases[index];
    }

    function updateUserBalance(address user, uint256 newBalance) public {
        UserInfo storage info = userInfo[user];
        info.balance = newBalance;
        info.lastUpdate = block.timestamp;
    }

    function toggleUserActive(address user) public {
        userInfo[user].isActive = !userInfo[user].isActive;
    }
}