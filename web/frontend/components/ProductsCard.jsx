import { useState } from "react";
import {
  Card,
  Heading,
  TextContainer,
  DisplayText,
  TextStyle,
} from "@shopify/polaris";
import { Toast } from "@shopify/app-bridge-react";
import { useAppQuery, useAuthenticatedFetch } from "../hooks";

export function ProductsCard() {
  const emptyToastProps = { content: null };
  const [isLoading, setIsLoading] = useState(true);
  const [toastProps, setToastProps] = useState(emptyToastProps);
  const fetch = useAuthenticatedFetch();

  const {
    data,
    refetch: refetchProductCount,
    isLoading: isLoadingCount,
    isRefetching: isRefetchingCount,
  } = useAppQuery({
    url: "/api/products/count",
    reactQueryOptions: {
      onSuccess: () => {
        setIsLoading(false);
      },
    },
  });

  const toastMarkup = toastProps.content && !isRefetchingCount && (
    <Toast {...toastProps} onDismiss={() => setToastProps(emptyToastProps)} />
  );

  const handlePopulate = async () => {
    setIsLoading(true);
    const response = await fetch("/api/products/create");

    if (response.ok) {
      await refetchProductCount();
      setToastProps({ content: "5 products created!" });
    } else {
      setIsLoading(false);
      setToastProps({
        content: "There was an error creating products",
        error: true,
      });
    }
  };

  const testButton = async () => {
    setIsLoading(true);
    await fetch("/api/create-order-webhook")
    .then(function(response) {
      return response.json();
    }).then(function(data) { 
      console.log(data); // this will be a string
      setIsLoading(false);
    });
    // const response = await fetch("/api/get-webhooks");

    // if (response.ok) {
    //   console.log('Ok: ', response.body);
    //   setIsLoading(false);
    // } else {
    //   console.log('Not Ok: ', response);
    //   setIsLoading(false);
    // }
  };

  const getAllEvents = async () => {
    setIsLoading(true);
    await fetch("/api/get-events")
    .then(function(response) {
      return response.json();
    }).then(function(data) { 
      console.log(data); // this will be a string
      setIsLoading(false);
    });
  };

  const getAllWebhooks = async () => {
    setIsLoading(true);
    await fetch("/api/get-webhooks")
    .then(function(response) {
      return response.json();
    }).then(function(data) { 
      console.log(data); // this will be a string
      setIsLoading(false);
    });
  };

  const createAllWebhooks = async () => {
    setIsLoading(true);
    await fetch("/api/create-webhooks")
    .then(function(response) {
      return response.json();
    }).then(function(data) { 
      console.log(data); // this will be a string
      setIsLoading(false);
    });
  };

  const deleteAllWebhooks = async () => {
    setIsLoading(true);
    await fetch("/api/delete-webhooks")
    .then(function(response) {
      return response.json();
    }).then(function(data) { 
      console.log(data); // this will be a string
      setIsLoading(false);
    });
  };

  const createCartWebhook = async () => {
    setIsLoading(true);
    await fetch("/api/create-cart-webhook")
    .then(function(response) {
      return response.json();
    }).then(function(data) { 
      console.log(data); // this will be a string
      setIsLoading(false);
    });
  };

  const createAccountWebhook = async () => {
    setIsLoading(true);
    await fetch("/api/create-account-webhook")
    .then(function(response) {
      return response.json();
    }).then(function(data) { 
      console.log(data); // this will be a string
      setIsLoading(false);
    });
  };

  return (
    <>
      {toastMarkup}
      <Card
        title="Product Counter"
        sectioned
        primaryFooterAction={{
          content: "Populate 5 products",
          onAction: handlePopulate,
          loading: isLoading,
        }}
      >
        <TextContainer spacing="loose">
          <p>
            Sample products are created with a default title and price. You can
            remove them at any time.
          </p>
          <Heading element="h4">
            TOTAL PRODUCTS
            <DisplayText size="medium">
              <TextStyle variation="strong">
                {isLoadingCount ? "-" : data.count}
              </TextStyle>
            </DisplayText>
            <button onClick={() => testButton()}>Test</button>
            <button onClick={() => createCartWebhook()}>Create cart webhook</button>
            <button onClick={() => createAccountWebhook()}>Create account webhook</button>
            <button onClick={() => getAllEvents()}>Get all events</button>
            <button onClick={() => getAllWebhooks()}>Get all webhooks</button>
            <button onClick={() => createAllWebhooks()}>Create all webhooks</button>
            <button onClick={() => deleteAllWebhooks()}>Delete all webhooks</button>
          </Heading>
        </TextContainer>
      </Card>
    </>
  );
}
