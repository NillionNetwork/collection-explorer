import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getNillionClient } from '@/lib/nillion-client';
import { getConfigFromHeaders, validateServerConfig } from '@/lib/server-config';
import '@/lib/bigint-serializer';

// Helper function to process data with secret fields
function processDataForStorage(data: Record<string, any>): Record<string, any> {
  const processed = { ...data };
  
  // Convert fields marked as secret to %allot format
  Object.keys(processed).forEach(key => {
    if (processed[key] && typeof processed[key] === 'object' && processed[key].isSecret) {
      processed[key] = { '%allot': processed[key].value };
    }
  });
  
  return processed;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  try {
    const { collectionId } = await params;
    const { searchParams } = new URL(request.url);
    const filterParam = searchParams.get('filter');
    const limitParam = searchParams.get('limit');
    
    const filter = filterParam ? JSON.parse(filterParam) : {};
    const limit = limitParam ? parseInt(limitParam) : undefined;
    
    // Get config from headers
    const config = getConfigFromHeaders(request.headers);
    validateServerConfig(config);
    
    const client = await getNillionClient(config);
    const result = await client.findData({
      collection: collectionId,
      filter,
      ...(limit && { limit }),
    });
    
    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch data' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  try {
    const { collectionId } = await params;
    const body = await request.json();
    const { data: rawData, type } = body;

    if (!rawData) {
      return NextResponse.json(
        { success: false, error: 'Missing data field' },
        { status: 400 }
      );
    }

    // Get config from headers
    const config = getConfigFromHeaders(request.headers);
    validateServerConfig(config);
    
    const client = await getNillionClient(config);

    // Handle both single record and array of records
    const dataArray = Array.isArray(rawData) ? rawData : [rawData];
    
    // Process each record
    const processedData = dataArray.map(record => ({
      _id: record._id || randomUUID(),
      ...processDataForStorage(record),
    }));

    if (type === 'owned') {
      // For owned data, use standard data creation
      await client.createStandardData({
        body: {
          collection: collectionId,
          data: processedData,
        },
        });
    } else {
      // For standard data
      await client.createStandardData({
        body: {
          collection: collectionId,
          data: processedData,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: `Added ${processedData.length} record(s)`,
      data: processedData,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to add data' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  try {
    const { collectionId } = await params;
    const body = await request.json();
    const { filter, update, type } = body;

    if (!filter || !update) {
      return NextResponse.json(
        { success: false, error: 'Missing filter or update fields' },
        { status: 400 }
      );
    }

    // Get config from headers
    const config = getConfigFromHeaders(request.headers);
    validateServerConfig(config);
    
    const client = await getNillionClient(config);
    
    // For records with encrypted fields, use delete + create approach
    // as updateData might not work properly with encrypted fields
    try {
      // First, delete the existing record
      await client.deleteData({
        collection: collectionId,
        filter,
      });

      // Then create the updated record with processed data
      const updatedRecord = {
        ...update,
        _id: filter._id, // Preserve the original ID
      };

      const processedData = processDataForStorage(updatedRecord);

      if (type === 'owned') {
        await client.createStandardData({
          body: {
            collection: collectionId,
            data: [processedData],
          },
        });
      } else {
        await client.createStandardData({
          body: {
            collection: collectionId,
            data: [processedData],
          },
        });
      }

      return NextResponse.json({
        success: true,
        message: 'Data updated successfully',
      });
    } catch (updateError) {
      
      // Fallback to direct update if delete+create fails
      await client.updateData({
        collection: collectionId,
        filter,
        update,
      });

      return NextResponse.json({
        success: true,
        message: 'Data updated successfully',
      });
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update data' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  try {
    const { collectionId } = await params;
    const { searchParams } = new URL(request.url);
    const filterParam = searchParams.get('filter');
    
    if (!filterParam) {
      return NextResponse.json(
        { success: false, error: 'Missing filter parameter' },
        { status: 400 }
      );
    }

    const filter = JSON.parse(filterParam);
    // Get config from headers
    const config = getConfigFromHeaders(request.headers);
    validateServerConfig(config);
    
    const client = await getNillionClient(config);
    
    await client.deleteData({
      collection: collectionId,
      filter,
    });

    return NextResponse.json({
      success: true,
      message: 'Data deleted successfully',
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to delete data' },
      { status: 500 }
    );
  }
}