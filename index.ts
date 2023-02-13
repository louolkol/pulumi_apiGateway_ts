import * as aws from "@pulumi/aws";





// create a api key
const myDemoApiKey = new aws.apigateway.ApiKey("myDemoApiKey", {value: "8bklk8bl1k3sB38D9B3l0enyWT8c09B30lkq0blk"});
 
// // export the api key
// export const myDemoApiKeyValue = myDemoApiKey.value;

// Define an endpoint that invokes a lambda to handle requests
const api = new aws.apigateway.RestApi("exampleRestApi", {
    apiKeySource: "HEADER",
});



const apiResource = new aws.apigateway.Resource("myDemoResource", {
    restApi: api.id,
    parentId: api.rootResourceId,
    pathPart: "nodes",
});

const apiMethod = new aws.apigateway.Method("any", {
    restApi: api.id,
    resourceId: apiResource.id,
    authorization: "NONE",
    httpMethod: "ANY",
    requestParameters: {
        "method.request.path.proxy": true,
    },
    apiKeyRequired: true,
});




// create a security group that allows HTTP ingress and unrestricted egress
const allow80sg = new aws.ec2.SecurityGroup("allowTls", {
    description: "Allow TLS inbound traffic",
    ingress: [{
        description: "TLS from VPC",
        fromPort: 80,
        toPort: 80,
        protocol: "tcp",
        cidrBlocks: ["0.0.0.0/0"],
        ipv6CidrBlocks: ["::/0"],
    }],
    egress: [{
        fromPort: 0,
        toPort: 0,
        protocol: "-1",
        cidrBlocks: ["0.0.0.0/0"],
        ipv6CidrBlocks: ["::/0"],
    }],
    tags: {
        Name: "allow_80",
    },
});

// create a simple ec2 instance for testing
const cheapWorker = new aws.ec2.SpotInstanceRequest("cheapWorker", {
    ami: "ami-0aa7d40eeae50c9a9",
    instanceType: "t3.micro",
    userData: `#!/bin/bash
yum install -y httpd.x86_64
systemctl start httpd.service
systemctl enable httpd.service
echo "Tokyo hostname: $(hostname -f)" > /var/www/html/index.html`,
    tags: {
        Name: "CheapWorker",
    },
    vpcSecurityGroupIds: [allow80sg.id],
});




// // create a subnet for the load balancer
// const lbSubnet = new aws.ec2.Subnet("lbSubnet", {
    
//     vpcId: "vpc-bef592c3",
//     cidrBlock: ""
//     availabilityZone: cheapWorker.availabilityZone,
//     tags: {
//         Name: "lbSubnet",
//     },
// });

// create a EIP for the load balancer
const lbEip = new aws.ec2.Eip("lbEip", {
    vpc: true,
    tags: {
        Name: "lbEip",
    },
});


// get the subnet list from the VPC
// const subnets = aws.ec2.getSubnetIds({
//     vpcId: "vpc-bef592c3",
// });



// get aws eip 
const nlb_eip = new aws.ec2.Eip("nlb_eip", {vpc: true});


// target group
const tg3 = new aws.lb.TargetGroup("tg3", {
    port: 80,
    protocol: "TCP",
    targetType: "instance",
    vpcId: "vpc-bef592c3",
    tags: {
        Name: "targetGroup",
    },
});


// const testTargetGroupAttachment = new aws.lb.TargetGroupAttachment("testTargetGroupAttachment", {
//     targetGroupArn: tg3.arn,
//     targetId: cheapWorker.id,
//     port: 80,
// });

// get the instance id from the spot instance
// const cheapWorkerID = aws.ec2.getInstance({
//     tags: { Name: "CheapWorker" },
// });

// need to ask how to get the exisiting resource id.
const testTargetGroupAttachment = new aws.lb.TargetGroupAttachment("TargetGroupAttachment", {
    targetGroupArn: tg3.arn,
    targetId: "i-0bad941ad3bc7c7df",
    port: 80,
});





// create Network load balancer and target group
const example = new aws.lb.LoadBalancer("example", {
    loadBalancerType: "network",
    internal: false,
    subnetMappings: [
        {
            subnetId: "subnet-ad717da3",
            allocationId: nlb_eip.id,
        },
        // {
        //     subnetId: "subnet-c42f65a2",
        //     privateIpv4Address: "172.31.0.2"
        // },
    ],
});

// create a listener for the load balancer
const exampleListener = new aws.lb.Listener("exampleListener", {
    loadBalancerArn: example.arn,
    port: 80,
    protocol: "TCP",
    defaultActions: [{
        type: "forward",
        targetGroupArn: tg3.arn,
    }],
});



// this was a class elb, so don't have a arn, so that can't be used as a target for VPClink
// const example = new aws.elb.LoadBalancer("lbForApi", {
//     availabilityZones: [cheapWorker.availabilityZone, "us-east-1d"],
//     listeners: [{
//         instancePort: 80,
//         instanceProtocol: "http",
//         lbPort: 80,
//         lbProtocol: "http",
//     }],
//     // subnets: [cheapWorker.subnetId],
//     securityGroups: [allow80sg.id],
//     tags: {
//         Name: "lbForApi",
//     },
// });








// create a vpc link link to the load balancer
const vpcLink = new aws.apigateway.VpcLink("vpcLink", {
    targetArn: example.arn,
    tags: {
        Name: "vpcLink",
    },
});







const apiIntegration = new aws.apigateway.Integration("myDemoIntegration", {
    

    // restApi: api.id,
    // resourceId: apiResource.id,
    restApi: api.id,
    // resourceId was the method id
    resourceId: apiMethod.resourceId,
    // uri: "http://example-3027737-0aa86e87bdcfe47b.elb.us-east-1.amazonaws.com",
    uri: example.dnsName.apply(dnsName => `http://${dnsName}`),
    httpMethod: apiMethod.httpMethod,
    integrationHttpMethod: "ANY",
    connectionType:"VPC_LINK",
    connectionId: vpcLink.id,


    type: "HTTP_PROXY",
//     cacheKeyParameters: ["method.request.path.param"],
//     cacheNamespace: "foobar",
//     timeoutMilliseconds: 29000,
//     requestParameters: {
//         "integration.request.header.X-Authorization": "'static'",
//     },
//     requestTemplates: {
//         "application/xml": `{
//    "body" : $input.json('$')
// }
// `,
//     },

// depends on the api gateway resource
    
}, {dependsOn: [api,apiMethod,apiResource]});



// api deployment
const apiDeployment = new aws.apigateway.Deployment("apiDeployment", {
    restApi: api.id,
    stageName: "test",
    stageDescription: "Production stage",
    description: "Production deployment",
});


// create api stage
const apiStage = new aws.apigateway.Stage("apiStage", {
    restApi: api.id,
    stageName: "test2",
    deployment: apiDeployment.id,
    // description: "Production stage",
    // cacheClusterEnabled: true,
    // cacheClusterSize: "0.5",
    // variables: {
    //     "a": "2",
    // },
    // tags: {
    //     Name: "apiStage",
    // },
});


const exampleUsagePlan = new aws.apigateway.UsagePlan("exampleUsagePlan", {
    apiStages: [
        {
            apiId: api.id,
            stage: apiStage.stageName,
        }
    ],
    quotaSettings: {
        limit: 20,
        offset: 2,
        period: "WEEK",
    },
    throttleSettings: {
        burstLimit: 5,
        rateLimit: 10,
    },
});


// add a usage plan key to the usage plan
const exampleUsagePlanKey = new aws.apigateway.UsagePlanKey("exampleUsagePlanKey", {
    keyId: myDemoApiKey.id,
    keyType: "API_KEY",
    usagePlanId: exampleUsagePlan.id,
});



// export const url = api.url;

// output the public IP of the instance
export const cheapWorkerIp = cheapWorker.publicIp;
// output the subnet ID of the instance
export const cheapWorkerSubnetId = cheapWorker.subnetId;