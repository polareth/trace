// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.23;

contract Structs {
    // Basic struct types
    struct BasicStruct {
        uint256 id;
        string name;
    }
    
    // Packed struct (multiple values in single storage slot)
    struct PackedStruct {
        uint8 a;
        uint16 b;
        uint32 c;
        bool d;
    }
    
    // Nested struct
    struct NestedStruct {
        uint256 id;
        BasicStruct basic;
    }
    
    // Struct with dynamic types
    struct DynamicStruct {
        uint256 id;
        uint256[] numbers;
        mapping(uint256 => bool) flags;
    }
    
    // Storage variables
    uint8 public precedingValue;
    PackedStruct public packedStruct;
    BasicStruct public basicStruct;
    NestedStruct public nestedStruct;
    DynamicStruct public dynamicStruct;
    
    // Initialize packed struct after a partial slot
    function initializePackedAfterPartial(uint8 preceding, uint8 a, uint16 b, uint32 c, bool d) public {
        precedingValue = preceding;
        packedStruct = PackedStruct(a, b, c, d);
    }
    
    // Get packed struct values
    function getPackedValues() public view returns (uint8, uint8, uint16, uint32, bool) {
        return (precedingValue, packedStruct.a, packedStruct.b, packedStruct.c, packedStruct.d);
    }
    
    // Demonstrate struct initialization methods
    function initializeStructs() public {
        // Named parameters
        basicStruct = BasicStruct({
            id: 1,
            name: "Named Init"
        });
        
        // Positional parameters
        nestedStruct = NestedStruct(2, BasicStruct(3, "Nested"));
        
        // Initialize dynamic struct
        dynamicStruct.id = 4;
    }
    
    // Demonstrate memory vs storage behavior
    function memoryVsStorage() public returns (string memory, string memory) {
        // Memory copy
        BasicStruct memory memStruct = basicStruct;
        memStruct.name = "Memory Modified";
        
        // Storage reference
        BasicStruct storage storageStruct = basicStruct;
        storageStruct.name = "Storage Modified";
        
        return (memStruct.name, basicStruct.name);
    }
    
    // Work with dynamic array in struct
    function addToDynamicArray(uint256 value) public {
        dynamicStruct.numbers.push(value);
    }
    
    function getDynamicArrayLength() public view returns (uint256) {
        return dynamicStruct.numbers.length;
    }
    
    // Work with mapping in struct
    function setFlag(uint256 key, bool value) public {
        dynamicStruct.flags[key] = value;
    }
    
    function getFlag(uint256 key) public view returns (bool) {
        return dynamicStruct.flags[key];
    }
    
    // Demonstrate struct deletion
    function deleteStruct() public {
        delete basicStruct;
        // Note: delete on struct with mapping doesn't clear the mapping
    }
}
